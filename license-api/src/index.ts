interface Env {
  DB: D1Database;
  API_SECRET?: string;
}

interface LicenseVerifyRequest {
  license_key: string;
  device_id: string;
  device_name?: string;
}

interface VersionCheckRequest {
  current_version: string;
}

interface LicenseCreateRequest {
  email?: string;
  expires_at?: string;
  max_devices?: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const authHeader = request.headers.get('Authorization');
    const isAdmin = env.API_SECRET ? authHeader === `Bearer ${env.API_SECRET}` : true;

    try {
      if (path === '/api/verify' && method === 'POST') {
        return handleVerifyLicense(request, env);
      }

      if (path === '/api/activate' && method === 'POST') {
        return handleActivateDevice(request, env);
      }

      if (path === '/api/version' && method === 'GET') {
        return handleVersionCheck(request, env);
      }

      if (path === '/api/version' && method === 'POST' && isAdmin) {
        return handleCreateVersion(request, env);
      }

      if (path === '/api/license' && method === 'POST' && isAdmin) {
        return handleCreateLicense(request, env);
      }

      if (path === '/api/license' && method === 'GET' && isAdmin) {
        return handleListLicenses(request, env);
      }

      if (path.match(/^\/api\/license\/[^/]+$/) && method === 'GET' && isAdmin) {
        const key = path.split('/')[3];
        return handleGetLicense(key, env);
      }

      if (path.match(/^\/api\/license\/[^/]+$/) && method === 'PUT' && isAdmin) {
        const key = path.split('/')[3];
        return handleUpdateLicense(key, request, env);
      }

      if (path.match(/^\/api\/license\/[^/]+$/) && method === 'DELETE' && isAdmin) {
        const key = path.split('/')[3];
        return handleDeleteLicense(key, env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handleVerifyLicense(request: Request, env: Env): Promise<Response> {
  const { license_key, device_id }: LicenseVerifyRequest = await request.json();

  if (!license_key || !device_id) {
    return new Response(JSON.stringify({ valid: false, error: 'Missing license_key or device_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const license = await env.DB.prepare(
    'SELECT * FROM licenses WHERE key = ? AND status = 1'
  ).bind(license_key).first();

  if (!license) {
    return new Response(JSON.stringify({ valid: false, error: 'Invalid license' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return new Response(JSON.stringify({ valid: false, error: 'License expired' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activationCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM activations WHERE license_key = ?'
  ).bind(license_key).first();

  if ((activationCount?.count || 0) >= (license.max_devices || 1)) {
    return new Response(JSON.stringify({ valid: false, error: 'Max devices reached' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    valid: true,
    expires_at: license.expires_at,
    max_devices: license.max_devices,
    device_count: activationCount?.count || 0,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleActivateDevice(request: Request, env: Env): Promise<Response> {
  const { license_key, device_id, device_name }: LicenseVerifyRequest = await request.json();

  if (!license_key || !device_id) {
    return new Response(JSON.stringify({ success: false, error: 'Missing license_key or device_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const license = await env.DB.prepare(
    'SELECT * FROM licenses WHERE key = ? AND status = 1'
  ).bind(license_key).first();

  if (!license) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid license' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return new Response(JSON.stringify({ success: false, error: 'License expired' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activationCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM activations WHERE license_key = ?'
  ).bind(license_key).first();

  if ((activationCount?.count || 0) >= (license.max_devices || 1)) {
    return new Response(JSON.stringify({ success: false, error: 'Max devices reached' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO activations (license_key, device_id, device_name) VALUES (?, ?, ?)'
    ).bind(license_key, device_id, device_name).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Device activated successfully',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Device already activated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleVersionCheck(request: Request, env: Env): Promise<Response> {
  const { current_version }: VersionCheckRequest = await request.json();

  const latestVersion = await env.DB.prepare(
    'SELECT * FROM app_versions WHERE is_stable = 1 ORDER BY created_at DESC LIMIT 1'
  ).first();

  if (!latestVersion) {
    return new Response(JSON.stringify({ update_available: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateAvailable = compareVersions(latestVersion.version, current_version) > 0;

  return new Response(JSON.stringify({
    update_available: updateAvailable,
    latest_version: latestVersion.version,
    download_url: latestVersion.download_url,
    changelog: latestVersion.changelog,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

async function handleCreateVersion(request: Request, env: Env): Promise<Response> {
  const { version, download_url, changelog, is_stable = 1 } = await request.json();

  if (!version || !download_url) {
    return new Response(JSON.stringify({ success: false, error: 'Missing version or download_url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await env.DB.prepare(
    'INSERT OR REPLACE INTO app_versions (version, download_url, changelog, is_stable) VALUES (?, ?, ?, ?)'
  ).bind(version, download_url, changelog, is_stable).run();

  return new Response(JSON.stringify({ success: true, message: 'Version created successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 4) key += '-';
  }
  return key;
}

async function handleCreateLicense(request: Request, env: Env): Promise<Response> {
  const { email, expires_at, max_devices = 1 }: LicenseCreateRequest = await request.json();

  let key = generateLicenseKey();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await env.DB.prepare('SELECT id FROM licenses WHERE key = ?').bind(key).first();
    if (!existing) break;
    key = generateLicenseKey();
    attempts++;
  }

  await env.DB.prepare(
    'INSERT INTO licenses (key, email, expires_at, max_devices) VALUES (?, ?, ?, ?)'
  ).bind(key, email, expires_at, max_devices).run();

  return new Response(JSON.stringify({
    success: true,
    license_key: key,
    email,
    expires_at,
    max_devices,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleListLicenses(request: Request, env: Env): Promise<Response> {
  const page = parseInt(request.url.split('?page=')[1]) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const licenses = await env.DB.prepare(
    'SELECT * FROM licenses ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM licenses').first();

  return new Response(JSON.stringify({
    data: licenses.results,
    total: total?.count || 0,
    page,
    limit,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGetLicense(key: string, env: Env): Promise<Response> {
  const license = await env.DB.prepare('SELECT * FROM licenses WHERE key = ?').bind(key).first();

  if (!license) {
    return new Response(JSON.stringify({ error: 'License not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activations = await env.DB.prepare(
    'SELECT * FROM activations WHERE license_key = ?'
  ).bind(key).all();

  return new Response(JSON.stringify({
    ...license,
    activations: activations.results,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleUpdateLicense(key: string, request: Request, env: Env): Promise<Response> {
  const { status, expires_at, max_devices } = await request.json();

  const updates: string[] = [];
  const params: (string | number | undefined)[] = [];

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (expires_at !== undefined) {
    updates.push('expires_at = ?');
    params.push(expires_at);
  }
  if (max_devices !== undefined) {
    updates.push('max_devices = ?');
    params.push(max_devices);
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ success: false, error: 'No fields to update' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  params.push(key);
  await env.DB.prepare(
    `UPDATE licenses SET ${updates.join(', ')} WHERE key = ?`
  ).bind(...params).run();

  return new Response(JSON.stringify({ success: true, message: 'License updated successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleDeleteLicense(key: string, env: Env): Promise<Response> {
  await env.DB.prepare('DELETE FROM licenses WHERE key = ?').bind(key).run();

  return new Response(JSON.stringify({ success: true, message: 'License deleted successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}