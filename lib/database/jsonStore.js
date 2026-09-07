import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ENCRYPTED_PREFIX = 'FCAJSON2:'; 

export class StoreDecryptionError extends Error {
  constructor(filePath, cause) {
    super(
      `[FCA JsonStore] Cannot decrypt "${filePath}". ` +
        `Check FCA_JSON_STORE_KEY or restore from a backup.\n` +
        `Cause: ${cause?.message ?? cause}`
    );
    this.name = 'StoreDecryptionError';
    this.filePath = filePath;
    this.cause = cause;
  }
}

function matches(row, where) {
  return where ? Object.entries(where).every(([key, value]) => row[key] === value) : true;
}

function applyOrder(rows, options) {
  const order = options?.order;
  if (!order?.length) return rows;
  const [field, direction] = order[0];
  const sorted = [...rows].sort((left, right) => {
    if (left[field] === right[field]) return 0;
    return left[field] > right[field] ? 1 : -1;
  });
  return String(direction).toUpperCase() === 'DESC' ? sorted.reverse() : sorted;
}

const SCRYPT_PARAMS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

const _keyCache = new Map();
const KEY_CACHE_MAX = 256;

function cacheGetOrSet(cacheKey, computeFn) {
  if (_keyCache.has(cacheKey)) {
    
    const value = _keyCache.get(cacheKey);
    _keyCache.delete(cacheKey);
    _keyCache.set(cacheKey, value);
    return value;
  }
  const value = computeFn();
  _keyCache.set(cacheKey, value);
  if (_keyCache.size > KEY_CACHE_MAX) {
    const oldestKey = _keyCache.keys().next().value;
    _keyCache.delete(oldestKey);
  }
  return value;
}

function deriveKey(secret, saltBuffer) {
  const cacheKey = `${secret}:${saltBuffer.toString('hex')}`;
  return cacheGetOrSet(cacheKey, () => crypto.scryptSync(secret, saltBuffer, 32, SCRYPT_PARAMS));
}

function getSecret() {
  return process.env.FCA_JSON_STORE_KEY ?? null;
}

function encrypt(plaintext) {
  const secret = getSecret();
  if (!secret) return plaintext;

  const salt = crypto.randomBytes(16); 
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 }); 
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); 

  
  return ENCRYPTED_PREFIX + Buffer.concat([salt, iv, tag, ciphertext]).toString('base64');
}

function decrypt(serialized, filePath) {
  if (!serialized.startsWith(ENCRYPTED_PREFIX)) return serialized;

  const secret = getSecret();
  if (!secret) {
    throw new StoreDecryptionError(
      filePath,
      new Error('FCA_JSON_STORE_KEY is not set but the file is encrypted')
    );
  }

  const payload = Buffer.from(serialized.slice(ENCRYPTED_PREFIX.length), 'base64');
  
  if (payload.length < 45) {
    throw new StoreDecryptionError(
      filePath,
      new Error('Payload too short — file may be truncated')
    );
  }

  const salt = payload.subarray(0, 16);
  const iv = payload.subarray(16, 28);
  const tag = payload.subarray(28, 44);
  const ciphertext = payload.subarray(44);

  const key = deriveKey(secret, salt);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 }); 
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new StoreDecryptionError(filePath, cause);
  }
}

export class JsonCollection {
  constructor(filePath, saveDelayMs = 150) {
    this.rows = [];
    this.nextId = 1;
    this.saveTimer = null;
    this.filePath = filePath;
    this.saveDelayMs = saveDelayMs;
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return;
    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) return;

    
    
    
    
    const parsed = JSON.parse(decrypt(raw, this.filePath));
    this.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    this.nextId =
      typeof parsed.nextId === 'number' && Number.isFinite(parsed.nextId)
        ? parsed.nextId
        : this.rows.length + 1;
  }

  saveSync() {
    const directory = path.dirname(this.filePath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    else {
      try {
        fs.chmodSync(directory, 0o700);
      } catch {}
    }

    const temporary = `${this.filePath}.tmp`;
    const serialized = encrypt(JSON.stringify({ nextId: this.nextId, rows: this.rows }));
    const descriptor = fs.openSync(temporary, 'w', 0o600);
    try {
      fs.writeSync(descriptor, serialized, 0, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    try {
      fs.chmodSync(temporary, 0o600);
    } catch {}
    fs.renameSync(temporary, this.filePath);
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveSync();
    }, this.saveDelayMs);
    this.saveTimer.unref?.();
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveSync();
  }

  wrap(row) {
    return {
      get: () => ({ ...row }),
      update: async (updates = {}) => {
        Object.assign(row, updates, { updatedAt: new Date().toISOString() });
        this.scheduleSave();
        return this.wrap(row);
      },
      destroy: async () => {
        this.rows = this.rows.filter((candidate) => candidate !== row);
        this.scheduleSave();
      },
    };
  }

  async findOne(options = {}) {
    const row = applyOrder(
      this.rows.filter((candidate) => matches(candidate, options.where)),
      options
    )[0];
    return row ? this.wrap(row) : null;
  }

  async findAll(options = {}) {
    return applyOrder(
      this.rows.filter((candidate) => matches(candidate, options.where)),
      options
    ).map((row) => {
      if (options.attributes?.length) {
        const selected = {};
        for (const attribute of options.attributes) selected[attribute] = row[attribute];
        return this.wrap(selected);
      }
      return this.wrap(row);
    });
  }

  async create(values) {
    const timestamp = new Date().toISOString();
    const row = { num: this.nextId++, ...values, createdAt: timestamp, updatedAt: timestamp };
    this.rows.push(row);
    this.scheduleSave();
    return this.wrap(row);
  }

  async destroy(options = {}) {
    if (!options.where || Object.keys(options.where).length === 0) {
      const count = this.rows.length;
      if (count) {
        this.rows = [];
        this.scheduleSave();
      }
      return count;
    }
    const originalCount = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, options.where));
    const count = originalCount - this.rows.length;
    if (count) this.scheduleSave();
    return count;
  }

  async sync() {
    return this;
  }

  async increment(field, options = {}) {
    const { by = 1, where } = options;
    const rows = this.rows.filter((row) => matches(row, where));
    const timestamp = new Date().toISOString();
    for (const row of rows) {
      row[field] = (typeof row[field] === 'number' ? row[field] : 0) + by;
      row.updatedAt = timestamp;
    }
    if (rows.length) this.scheduleSave();
    return [rows.length];
  }
}

export default { JsonCollection };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-database-json-store',
  meta: { category: 'database', path: 'lib/database/jsonStore.js' },
  setup(_ctx) {
    // provides: StoreDecryptionError, JsonCollection
  },
};
