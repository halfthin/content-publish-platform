import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { createLogger } from '../config/logger';

const logger = createLogger('encryption');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * 从密码派生密钥
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 128 * 1024 * 1024,
      },
      (err, key) => {
        if (err) {
          reject(err);
        } else {
          resolve(key as Buffer);
        }
      }
    );
  });
}

/**
 * 加密数据（AES-256-GCM）
 */
export async function encrypt(data: string, password: string, salt?: string): Promise<string> {
  try {
    // 生成随机 salt
    const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(SALT_LENGTH);

    // 派生密钥
    const key = await deriveKey(password, saltBuffer);

    // 生成随机 IV
    const iv = randomBytes(IV_LENGTH);

    // 创建加密器
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // 加密数据
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // 获取 auth tag
    const authTag = cipher.getAuthTag();

    // 组合结果：salt + iv + authTag + encrypted
    const result = Buffer.concat([saltBuffer, iv, authTag, Buffer.from(encrypted, 'hex')]).toString(
      'hex'
    );

    logger.debug('Data encrypted successfully');

    return result;
  } catch (error) {
    logger.error('Encryption failed', { error: String(error) });
    throw new Error(`Encryption failed: ${error}`);
  }
}

/**
 * 解密数据（AES-256-GCM）
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  try {
    // 解析加密数据
    const dataBuffer = Buffer.from(encryptedData, 'hex');

    // 提取各部分
    const saltBuffer = dataBuffer.subarray(0, SALT_LENGTH);
    const iv = dataBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = dataBuffer.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = dataBuffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // 派生密钥
    const key = await deriveKey(password, saltBuffer);

    // 创建解密器
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // 设置 auth tag
    decipher.setAuthTag(authTag);

    // 解密数据
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const result = decrypted.toString('utf8');

    logger.debug('Data decrypted successfully');

    return result;
  } catch (error) {
    logger.error('Decryption failed', { error: String(error) });
    throw new Error(`Decryption failed: ${error}`);
  }
}

/**
 * 生成随机 salt
 */
export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString('hex');
}

function isValidCookie(cookie: unknown): boolean {
  if (!cookie || typeof cookie !== 'object') {
    return false;
  }

  const input = cookie as Record<string, unknown>;
  const hasName = typeof input.name === 'string' && input.name.trim().length > 0;
  const hasValue =
    typeof input.value === 'string' ||
    typeof input.value === 'number' ||
    typeof input.value === 'boolean';
  const hasDomain = typeof input.domain === 'string' && input.domain.trim().length > 0;
  const hasUrl = typeof input.url === 'string' && input.url.trim().length > 0;

  return hasName && hasValue && (hasDomain || hasUrl);
}

/**
 * 加密 Cookie 数据
 */
export async function encryptCookies(cookies: unknown[], password: string): Promise<string> {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error('Cookie array must not be empty');
  }

  if (!cookies.every(isValidCookie)) {
    throw new Error('Cookie structure is invalid');
  }

  const jsonString = JSON.stringify(cookies);
  return encrypt(jsonString, password);
}

/**
 * 解密 Cookie 数据
 */
export async function decryptCookies(
  encryptedCookies: string,
  password: string
): Promise<Record<string, unknown>[]> {
  const jsonString = await decrypt(encryptedCookies, password);
  return JSON.parse(jsonString);
}

/**
 * 验证加密密钥是否正确
 */
export async function verifyEncryptionKey(password: string, testSalt: string): Promise<boolean> {
  try {
    const testData = 'test';
    const encrypted = await encrypt(testData, password, testSalt);
    const decrypted = await decrypt(encrypted, password);
    return decrypted === testData;
  } catch {
    return false;
  }
}

export function validateEncryptionKey(password: string): boolean {
  return (
    password.length >= 16 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function generateEncryptionKey(length = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';

  while (true) {
    const bytes = randomBytes(length);
    const password = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    if (validateEncryptionKey(password)) {
      return password;
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const derived = await deriveKey(password, Buffer.from(salt, 'hex'));
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }

  const derived = await deriveKey(password, Buffer.from(salt, 'hex'));
  const stored = Buffer.from(hash, 'hex');

  if (stored.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(stored, derived);
}
