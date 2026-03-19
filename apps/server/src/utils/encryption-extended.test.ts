import { describe, expect, test } from 'bun:test';
import {
  decrypt,
  decryptCookies,
  encrypt,
  encryptCookies,
  generateEncryptionKey,
  hashPassword,
  validateEncryptionKey,
  verifyPassword,
} from './encryption';

describe('Extended Encryption Utilities', () => {
  const testPassword = 'test-password-123!@#';
  const _testCookies = [
    {
      name: 'session_id',
      value: 'abc123xyz789',
      domain: '.xiaohongshu.com',
      path: '/',
      expires: Date.now() + 86400000, // 1 day from now
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    },
    {
      name: 'user_token',
      value: 'xyz789abc123',
      domain: '.xiaohongshu.com',
      path: '/',
      httpOnly: false,
      secure: false,
    },
  ];

  describe('Key validation', () => {
    test('should validate strong encryption key', () => {
      const strongKey = 'StrongPassword123!@#';
      expect(validateEncryptionKey(strongKey)).toBe(true);
    });

    test('should reject weak encryption key', () => {
      const weakKeys = [
        'short', // Too short
        'nouppercase123', // No uppercase
        'NOLOWERCASE123', // No lowercase
        'NoNumbers!', // No numbers
        'NoSpecial123', // No special characters
      ];

      weakKeys.forEach((key) => {
        expect(validateEncryptionKey(key)).toBe(false);
      });
    });

    test('should generate valid encryption key', () => {
      const key = generateEncryptionKey();

      expect(key).toBeTruthy();
      expect(key.length).toBeGreaterThanOrEqual(16);
      expect(validateEncryptionKey(key)).toBe(true);
    });
  });

  describe('Password hashing', () => {
    test('should hash password correctly', async () => {
      const password = 'MySecurePassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);

      // Hash should be different each time (due to salt)
      const hash2 = await hashPassword(password);
      expect(hash).not.toBe(hash2);
    });

    test('should verify correct password', async () => {
      const password = 'TestPassword456!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'TestPassword456!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('WrongPassword123!', hash);
      expect(isValid).toBe(false);
    });

    test('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toBeTruthy();

      const isValid = await verifyPassword('', hash);
      expect(isValid).toBe(true);
    });
  });

  describe('Cookie encryption edge cases', () => {
    test('should handle cookies with special characters', async () => {
      const specialCookies = [
        {
          name: 'token',
          value: 'abc123!@#$%^&*()_+-=[]{}|;:,.<>?',
          domain: 'example.com',
          path: '/',
        },
        {
          name: 'session',
          value: '中文测试😀🎉',
          domain: 'example.com',
          path: '/',
        },
      ];

      const encrypted = await encryptCookies(specialCookies, testPassword);
      const decrypted = await decryptCookies(encrypted, testPassword);

      expect(decrypted).toEqual(specialCookies);
    });

    test('should handle large cookie arrays', async () => {
      const largeCookies = Array.from({ length: 100 }, (_, i) => ({
        name: `cookie_${i}`,
        value: `value_${i}_${'x'.repeat(100)}`, // 100 chars each
        domain: '.example.com',
        path: '/',
      }));

      const encrypted = await encryptCookies(largeCookies, testPassword);
      const decrypted = await decryptCookies(encrypted, testPassword);

      expect(decrypted).toHaveLength(100);
      expect(decrypted[0].name).toBe('cookie_0');
      expect(decrypted[99].name).toBe('cookie_99');
    });

    test('should handle cookies with undefined/null values', async () => {
      const cookiesWithNulls = [
        {
          name: 'test',
          value: 'normal',
          domain: 'example.com',
          path: '/',
          expires: undefined,
          httpOnly: undefined,
          secure: undefined,
          sameSite: undefined,
        },
      ];

      const encrypted = await encryptCookies(cookiesWithNulls, testPassword);
      const decrypted = await decryptCookies(encrypted, testPassword);

      // Undefined values should be omitted
      expect(decrypted[0].name).toBe('test');
      expect(decrypted[0].value).toBe('normal');
      expect(decrypted[0].domain).toBe('example.com');
      expect(decrypted[0].path).toBe('/');
      expect(decrypted[0].expires).toBeUndefined();
    });
  });

  describe('Performance tests', () => {
    test('should encrypt/decrypt within reasonable time', async () => {
      const testData = 'A'.repeat(10000); // 10KB of data

      const startEncrypt = performance.now();
      const encrypted = await encrypt(testData, testPassword);
      const encryptTime = performance.now() - startEncrypt;

      const startDecrypt = performance.now();
      await decrypt(encrypted, testPassword);
      const decryptTime = performance.now() - startDecrypt;

      // Should complete within 500ms for 10KB
      expect(encryptTime).toBeLessThan(500);
      expect(decryptTime).toBeLessThan(500);

      console.log(`Encrypt 10KB: ${encryptTime.toFixed(2)}ms`);
      console.log(`Decrypt 10KB: ${decryptTime.toFixed(2)}ms`);
    });

    test('should handle concurrent encryption operations', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        encrypt(`test-data-${i}`, testPassword)
      );

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      expect(results).toHaveLength(10);
      expect(results.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);

      // 10 concurrent operations should complete within 2 seconds
      expect(totalTime).toBeLessThan(2000);
      console.log(`10 concurrent encryptions: ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Security tests', () => {
    test('should not leak information through timing attacks', async () => {
      const correctPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const testData = 'sensitive-data';

      const encrypted = await encrypt(testData, correctPassword);

      // Measure time for correct password
      const startCorrect = performance.now();
      try {
        await decrypt(encrypted, correctPassword);
      } catch {}
      const timeCorrect = performance.now() - startCorrect;

      // Measure time for wrong password
      const startWrong = performance.now();
      try {
        await decrypt(encrypted, wrongPassword);
      } catch {}
      const timeWrong = performance.now() - startWrong;

      // Timing difference should be minimal (within 10ms)
      const timeDiff = Math.abs(timeCorrect - timeWrong);
      expect(timeDiff).toBeLessThan(10);

      console.log(
        `Timing attack test - Correct: ${timeCorrect.toFixed(2)}ms, Wrong: ${timeWrong.toFixed(2)}ms, Diff: ${timeDiff.toFixed(2)}ms`
      );
    });

    test('should use different IV for each encryption', async () => {
      const sameData = 'identical-data';
      const samePassword = 'same-password-123';

      const encrypted1 = await encrypt(sameData, samePassword);
      const encrypted2 = await encrypt(sameData, samePassword);

      // Same data with same password should produce different ciphertext
      // (due to random IV)
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      const decrypted1 = await decrypt(encrypted1, samePassword);
      const decrypted2 = await decrypt(encrypted2, samePassword);
      expect(decrypted1).toBe(sameData);
      expect(decrypted2).toBe(sameData);
    });
  });

  describe('Error handling and validation', () => {
    test('should reject tampered ciphertext', async () => {
      const originalData = 'original-data';
      const encrypted = await encrypt(originalData, testPassword);

      // Tamper with the ciphertext (change one character)
      const tampered = `${encrypted.slice(0, -10)}XXXXXXXXXX`;

      try {
        await decrypt(tampered, testPassword);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Decryption failed');
      }
    });

    test('should handle malformed ciphertext', async () => {
      const malformedInputs = [
        '', // Empty string
        'not-hex-encoded', // Not hex encoded
        '123456', // Too short
        'x'.repeat(200), // Invalid format
      ];

      for (const input of malformedInputs) {
        try {
          await decrypt(input, testPassword);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    test('should validate cookie structure before encryption', async () => {
      const invalidCookies = [
        {}, // Empty object
        { name: 'test' }, // Missing required fields
        { value: 'test', domain: 'example.com' }, // Missing name
        { name: 123, value: 'test', domain: 'example.com', path: '/' }, // Invalid name type
      ];

      for (const cookies of invalidCookies) {
        try {
          await encryptCookies([cookies as Record<string, unknown>], testPassword);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });
});
