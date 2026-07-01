# 部署指南

## 项目结构

```
license-api/
├── src/
│   └── index.ts          # 主 API 代码
├── migrations/
│   └── 0001_create_licenses_table.sql  # 数据库迁移文件
├── wrangler.jsonc        # Cloudflare 配置文件
├── package.json          # 项目配置
└── DEPLOYMENT.md         # 本文件
```

## API 接口说明

### 公开接口（无需认证）
- `POST /api/verify` - 验证许可证
- `POST /api/activate` - 激活设备
- `POST /api/version` - 检查版本更新

### 管理接口（需要 Bearer Token）
- `POST /api/license` - 创建许可证
- `GET /api/license` - 列出所有许可证
- `GET /api/license/{key}` - 获取单个许可证详情
- `PUT /api/license/{key}` - 更新许可证
- `DELETE /api/license/{key}` - 删除许可证
- `POST /api/version` - 发布新版本
- `POST /api/upload` - 上传安装包

---

## 部署步骤

### 第一步：登录 Cloudflare

打开终端，运行以下命令：

```bash
npx wrangler login
```

这会打开浏览器，登录你的 Cloudflare 账号并授权 Wrangler CLI。

### 第二步：创建 D1 数据库

```bash
npx wrangler d1 create license-db
```

执行后会输出类似这样的信息：

```
✅ Successfully created DB 'license-db'

[[d1_databases]]
binding = "DB"
database_name = "license-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

复制 `database_id` 的值，替换 `wrangler.jsonc` 中的 `YOUR_DATABASE_ID`。

### 第三步：创建 R2 存储桶

```bash
npx wrangler r2 bucket create app-packages
```

### 第四步：应用数据库迁移

```bash
npx wrangler d1 migrations apply license-db --remote
```

### 第五步：设置 API 密钥

```bash
npx wrangler secret put API_SECRET
```

系统会提示你输入密钥值，请输入一个安全的随机字符串（如：`my-secret-key-12345`）。

### 第六步：部署到 Cloudflare

```bash
npm run deploy
```

部署成功后会输出 Worker 的访问地址，类似：

```
https://license-api.yourname.workers.dev
```

---

## GitHub 自动部署配置

### 方式一：Cloudflare Dashboard 配置（推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 找到你的 `license-api` Worker
4. 在 **Settings** → **GitHub** 中关联你的 GitHub 仓库
5. 配置自动部署分支（如 `main`）

### 方式二：GitHub Actions

在 `.github/workflows/deploy.yml` 创建以下文件：

```yaml
name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Wrangler
        run: npm install -g wrangler
      - name: Deploy
        run: wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

然后在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：
- `CLOUDFLARE_API_TOKEN` - 你的 Cloudflare API Token

---

## 使用示例

### 1. 创建许可证

```bash
curl -X POST https://license-api.yourname.workers.dev/api/license \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "max_devices": 1}'
```

响应：
```json
{
  "success": true,
  "license_key": "ABCD-EFGH-IJKL-MNOP-QRST",
  "email": "user@example.com",
  "max_devices": 1
}
```

### 2. 验证许可证

```bash
curl -X POST https://license-api.yourname.workers.dev/api/verify \
  -H "Content-Type: application/json" \
  -d '{"license_key": "ABCD-EFGH-IJKL-MNOP-QRST", "device_id": "device-123"}'
```

响应：
```json
{
  "valid": true,
  "expires_at": null,
  "max_devices": 1,
  "device_count": 0
}
```

### 3. 检查版本更新

```bash
curl -X POST https://license-api.yourname.workers.dev/api/version \
  -H "Content-Type: application/json" \
  -d '{"current_version": "1.0.0"}'
```

响应：
```json
{
  "update_available": false,
  "latest_version": "1.0.0",
  "download_url": "https://example.com/download/v1.0.0.exe",
  "changelog": "Initial release"
}
```

### 4. 发布新版本

```bash
curl -X POST https://license-api.yourname.workers.dev/api/version \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "download_url": "https://license-api.yourname.workers.dev/download/myapp-v1.1.0.exe",
    "changelog": "新增功能，修复bug"
  }'
```

### 5. 上传安装包

```bash
curl -X POST https://license-api.yourname.workers.dev/api/upload \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -F "file=@myapp-v1.1.0.exe"
```

---

## 注意事项

1. **自定义域名**：`.workers.dev` 域名在国内可能受限，建议绑定自定义域名
2. **大文件上传**：R2 控制台上传单文件最大 300MB，大文件建议使用 CLI 或 S3 兼容工具
3. **免费额度**：免费计划每天 10 万次请求，足够个人/小型项目使用
4. **API 密钥安全**：不要在前端代码中暴露 `API_SECRET`，只在管理后台使用