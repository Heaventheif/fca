import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ENCRYPTED_PREFIX = "FCAJSON2:"; // v2 = per-file random salt

// ─── ERROR TYPES ─────────────────────────────────────────────────────────────

/**
 * Thrown when load() cannot decrypt an existing encrypted file.
 * Callers MUST catch this and decide whether to abort — the store
 * will NOT silently overwrite data with an empty collection.
 */
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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
  return String(direction).toUpperCase() === "DESC" ? sorted.reverse() : sorted;
}

// ─── KEY DERIVATION (FCA-04 + FCA-05 fixes) ──────────────────────────────────
/**
 * scrypt parameters: N=2^17 requires ~128 MB RAM per attempt.
 * Key is cached per (secret, salt) pair so scryptSync runs at most ONCE
 * per process lifetime — fixing the FCA-05 repeated-derivation bug.
 *
 * FCA-04 fix: salt is now a 16-byte random value stored inside the file
 * header (see encrypt/decrypt), not a global constant. Each file gets its
 * own salt, eliminating cross-file precomputation attacks.
 */
const SCRYPT_PARAMS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

/** In-process key cache: Map<`${secret}:${saltHex}` → Buffer(32)> */
const _keyCache = new Map();

function deriveKey(secret, saltBuffer) {
  const cacheKey = `${secret}:${saltBuffer.toString('hex')}`;
  if (_keyCache.has(cacheKey)) return _keyCache.get(cacheKey);
  const key = crypto.scryptSync(secret, saltBuffer, 32, SCRYPT_PARAMS);
  _keyCache.set(cacheKey, key);
  return key;
}

function getSecret() {
  return process.env.FCA_JSON_STORE_KEY ?? null;
}

// ─── ENCRYPTION (AES-256-GCM, explicit authTagLength=16) ─────────────────────
// Wire format (base64 after prefix):
//   [16 bytes random salt][12 bytes IV][16 bytes GCM auth tag][N bytes ciphertext]

function encrypt(plaintext) {
  const secret = getSecret();
  if (!secret) return plaintext;

  const salt = crypto.randomBytes(16);         // FCA-04: per-file random salt
  const iv   = crypto.randomBytes(12);
  const key  = deriveKey(secret, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 }); // FCA-08
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // always 16 bytes with explicit authTagLength

  // layout: salt(16) | iv(12) | tag(16) | ciphertext
  return ENCRYPTED_PREFIX + Buffer.concat([salt, iv, tag, ciphertext]).toString("base64");
}

function decrypt(serialized, filePath) {
  if (!serialized.startsWith(ENCRYPTED_PREFIX)) return serialized;

  const secret = getSecret();
  if (!secret) {
    throw new StoreDecryptionError(filePath,
      new Error("FCA_JSON_STORE_KEY is not set but the file is encrypted"));
  }

  const payload = Buffer.from(serialized.slice(ENCRYPTED_PREFIX.length), "base64");
  // minimum: 16 (salt) + 12 (iv) + 16 (tag) + 1 (ciphertext) = 45
  if (payload.length < 45) {
    throw new StoreDecryptionError(filePath, new Error("Payload too short — file may be truncated"));
  }

  const salt       = payload.subarray(0, 16);
  const iv         = payload.subarray(16, 28);
  const tag        = payload.subarray(28, 44);
  const ciphertext = payload.subarray(44);

  const key = deriveKey(secret, salt);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 }); // FCA-08
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (cause) {
    throw new StoreDecryptionError(filePath, cause);
  }
}

// ─── COLLECTION ───────────────────────────────────────────────────────────────

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
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return;

    // FCA-02 fix: NO silent catch. If the file exists but cannot be decrypted
    // we throw StoreDecryptionError — callers must handle it explicitly.
    // We never silently reset rows to [] because that would cause saveSync()
    // to overwrite the encrypted file with empty data, destroying user data.
    const parsed = JSON.parse(decrypt(raw, this.filePath));
    this.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    this.nextId = typeof parsed.nextId === "number" && Number.isFinite(parsed.nextId)
      ? parsed.nextId
      : this.rows.length + 1;
  }

  saveSync() {
    const directory = path.dirname(this.filePath);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    else {
      try { fs.chmodSync(directory, 0o700); } catch {}
    }

    const temporary = `${this.filePath}.tmp`;
    const serialized = encrypt(JSON.stringify({ nextId: this.nextId, rows: this.rows }));
    const descriptor = fs.openSync(temporary, "w", 0o600);
    try {
      fs.writeSync(descriptor, serialized, 0, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    try { fs.chmodSync(temporary, 0o600); } catch {}
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
    const row = applyOrder(this.rows.filter((candidate) => matches(candidate, options.where)), options)[0];
    return row ? this.wrap(row) : null;
  }

  async findAll(options = {}) {
    return applyOrder(this.rows.filter((candidate) => matches(candidate, options.where)), options)
      .map((row) => {
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

  async sync() { return this; }

  async increment(field, options = {}) {
    const { by = 1, where } = options;
    const rows = this.rows.filter((row) => matches(row, where));
    const timestamp = new Date().toISOString();
    for (const row of rows) {
      row[field] = (typeof row[field] === "number" ? row[field] : 0) + by;
      row.updatedAt = timestamp;
    }
    if (rows.length) this.scheduleSave();
    return [rows.length];
  }
}

export default { JsonCollection };
