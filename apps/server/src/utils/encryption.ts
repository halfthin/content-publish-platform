import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { createLogger } from '../config/logger';

const logger = createLogger('encryption');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

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

/**
 * 加密 Cookie 数据
 */
export async function encryptCookies(cookies: any[], password: string): Promise<string> {
  const jsonString = JSON.stringify(cookies);
  return encrypt(jsonString, password);
}

/**
 * 解密 Cookie 数据
 */
export async function decryptCookies(encryptedCookies: string, password: string): Promise<any[]> {
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
