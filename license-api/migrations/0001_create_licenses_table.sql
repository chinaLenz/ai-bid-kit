CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  email TEXT,
  status INTEGER DEFAULT 1,
  expires_at DATETIME,
  max_devices INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT,
  activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_key) REFERENCES licenses(key) ON DELETE CASCADE,
  UNIQUE(license_key, device_id)
);

CREATE TABLE IF NOT EXISTS app_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT UNIQUE NOT NULL,
  download_url TEXT NOT NULL,
  changelog TEXT,
  is_stable INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_versions (version, download_url, changelog, is_stable) VALUES ('1.0.0', 'https://example.com/download/v1.0.0.exe', 'Initial release', 1);

CREATE INDEX idx_licenses_key ON licenses(key);
CREATE INDEX idx_activations_license_key ON activations(license_key);
CREATE INDEX idx_activations_device_id ON activations(device_id);