import { describe, expect, test } from 'bun:test';
import { decrypt, decryptCookies, encrypt, encryptCookies, generateSalt } from './encryption';

describe('Encryption utilities', () => {
  const testPassword = 'test-password-123';
  const testCookies = [
    { name: 'session_id', value: 'abc123', domain: '.xiaohongshu.com', path: '/' },
    { name: 'user_token', value: 'xyz789', domain: '.xiaohongshu.com', path: '/' },
  ];

  test('should encrypt and decrypt data correctly', async () => {
    const testData = 'This is a test string for encryption';

    const encrypted = await encrypt(testData, testPassword);
    const decrypted = await decrypt(encrypted, testPassword);

    expect(encrypted).toBeTruthy();
    expect(decrypted).toBe(testData);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);
  });

  test('should encrypt and decrypt cookies correctly', async () => {
    const encrypted = await encryptCookies(testCookies, testPassword);
    const decrypted = await decryptCookies(encrypted, testPassword);

    expect(encrypted).toBeTruthy();
    expect(Array.isArray(decrypted)).toBe(true);
    expect(decrypted).toHaveLength(2);
    expect(decrypted[0].name).toBe('session_id');
    expect(decrypted[1].name).toBe('user_token');
  });

  test('should generate random salt', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).toBeTruthy();
    expect(salt2).toBeTruthy();
    expect(salt1).not.toBe(salt2);
    expect(salt1.length).toBe(64); // 32 bytes in hex
    expect(salt2.length).toBe(64);
  });

  test('should fail decryption with wrong password', async () => {
    const testData = 'Sensitive data';
    const encrypted = await encrypt(testData, testPassword);

    try {
      await decrypt(encrypted, 'wrong-password');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Decryption failed');
    }
  });

  test('should handle empty data encryption', async () => {
    const encrypted = await encrypt('', testPassword);
    const decrypted = await decrypt(encrypted, testPassword);

    expect(encrypted).toBeTruthy();
    expect(decrypted).toBe('');
  });

  test('should handle special characters in data', async () => {
    const testData = '特殊字符测试：中文、emoji 😀、符号 !@#$%^&*()';
    const encrypted = await encrypt(testData, testPassword);
    const decrypted = await decrypt(encrypted, testPassword);

    expect(decrypted).toBe(testData);
  });

  test('should encrypt with custom salt', async () => {
    const customSalt = generateSalt();
    const testData = 'Test with custom salt';

    const encrypted1 = await encrypt(testData, testPassword, customSalt);
    const encrypted2 = await encrypt(testData, testPassword, customSalt);

    // Same salt but different IVs - should produce different encrypted results
    // but both should decrypt to the same plaintext
    expect(encrypted1).not.toBe(encrypted2);

    const decrypted1 = await decrypt(encrypted1, testPassword);
    const decrypted2 = await decrypt(encrypted2, testPassword);

    expect(decrypted1).toBe(testData);
    expect(decrypted2).toBe(testData);
  });
});
