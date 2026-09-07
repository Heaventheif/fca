import crypto from 'node:crypto';

const ENC_PREFIX_V1 = 'fcaenc1:'; 
const ENC_PREFIX_V2 = 'fcaenc2:'; 

const _keyCacheBySecretAndSalt = new Map(); 
const _warnedMessages = new Set();

const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function warnOnce(logger, message) {
  if (_warnedMessages.has(message)) return;
  _warnedMessages.add(message);
  try {
    logger?.(message, 'warn');
  } catch {
    
  }
}

function deriveKey(saltBuffer) {
  const secret = process.env.APPSTATE_ENCRYPTION_KEY;
  if (!secret) return null;
  const key = String(secret);
  const cacheKey = `${key}:${saltBuffer.toString('hex')}`;
  if (_keyCacheBySecretAndSalt.has(cacheKey)) return _keyCacheBySecretAndSalt.get(cacheKey);
  const derived = crypto.scryptSync(key, saltBuffer, 32, SCRYPT_PARAMS);
  _keyCacheBySecretAndSalt.set(cacheKey, derived);
  return derived;
}

function hasSecret() {
  return !!process.env.APPSTATE_ENCRYPTION_KEY;
}

function backupsDisabled() {
  return process.env.FCA_DISABLE_APPSTATE_BACKUP === 'true';
}

function canWriteBackup(logger) {
  if (backupsDisabled()) return false;
  if (hasSecret()) return true;
  if (process.env.FCA_ALLOW_PLAINTEXT_APPSTATE_BACKUP === 'true') {
    warnOnce(
      logger,
      '[SECURITY] FCA_ALLOW_PLAINTEXT_APPSTATE_BACKUP=true — النسخة الاحتياطية ' +
        'لـ AppState/الكوكيز تُكتب كنص صريح غير مشفّر في قاعدة البيانات.'
    );
    return true;
  }
  warnOnce(
    logger,
    '[SECURITY] لم يُضبط APPSTATE_ENCRYPTION_KEY — تم تخطي النسخة الاحتياطية ' +
      'التلقائية لـ AppState تفادياً لتخزينها كنص صريح. اضبط APPSTATE_ENCRYPTION_KEY ' +
      'لتفعيلها مشفّرة، أو FCA_DISABLE_APPSTATE_BACKUP=true لتعطيلها نهائياً، أو ' +
      'FCA_ALLOW_PLAINTEXT_APPSTATE_BACKUP=true إن كنت تقبل تخزينها بلا تشفير عن قصد.'
  );
  return false;
}

function encryptBackupString(plaintext) {
  if (!hasSecret()) return plaintext; 
  const salt = crypto.randomBytes(16); 
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return (
    ENC_PREFIX_V2 +
    [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':')
  );
}

function decryptBackupString(stored, logger) {
  if (typeof stored !== 'string') return stored;

  if (stored.startsWith(ENC_PREFIX_V2)) {
    if (!hasSecret()) {
      warnOnce(
        logger,
        '[SECURITY] عُثر على نسخة احتياطية مشفّرة لكن APPSTATE_ENCRYPTION_KEY غير مضبوط الآن — ' +
          'تعذّر فك التشفير. تأكد من استخدام نفس المفتاح الذي كُتبت به.'
      );
      return null;
    }
    try {
      const [saltB64, ivB64, tagB64, ctB64] = stored.slice(ENC_PREFIX_V2.length).split(':');
      const key = deriveKey(Buffer.from(saltB64, 'base64'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'), {
        authTagLength: 16,
      });
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ctB64, 'base64')),
        decipher.final(),
      ]);
      return plaintext.toString('utf8');
    } catch (e) {
      warnOnce(logger, `[SECURITY] فشل فك تشفير نسخة AppState الاحتياطية: ${e?.message}`);
      return null;
    }
  }

  if (stored.startsWith(ENC_PREFIX_V1)) {
    if (!hasSecret()) {
      warnOnce(
        logger,
        '[SECURITY] عُثر على نسخة احتياطية مشفّرة (تنسيق قديم) لكن APPSTATE_ENCRYPTION_KEY غير مضبوط الآن — ' +
          'تعذّر فك التشفير.'
      );
      return null;
    }
    try {
      
      
      const legacyKey = crypto.scryptSync(
        String(process.env.APPSTATE_ENCRYPTION_KEY),
        'fca-appstate-backup-v1',
        32
      );
      const [ivB64, tagB64, ctB64] = stored.slice(ENC_PREFIX_V1.length).split(':');
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        legacyKey,
        Buffer.from(ivB64, 'base64')
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ctB64, 'base64')),
        decipher.final(),
      ]);
      warnOnce(
        logger,
        '[SECURITY] تم فك تشفير نسخة احتياطية بالتنسيق القديم (ملح ثابت). سيُعاد كتابتها بالتنسيق ' +
          'الجديد (ملح عشوائي لكل قيمة) عند أول تحديث لاحق.'
      );
      return plaintext.toString('utf8');
    } catch (e) {
      warnOnce(
        logger,
        `[SECURITY] فشل فك تشفير نسخة AppState الاحتياطية (تنسيق قديم): ${e?.message}`
      );
      return null;
    }
  }

  return stored; 
}

export { backupsDisabled, canWriteBackup, encryptBackupString, decryptBackupString };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-backup-crypto',
  meta: { category: 'safety', path: 'lib/safety/backup-crypto.js' },
  setup(_ctx) {
    // provides: backupsDisabled, canWriteBackup, encryptBackupString, decryptBackupString
  },
};
