import { afterEach, describe, expect, it } from "vitest";
import { EncryptionService } from "./encryption.service";

describe("EncryptionService", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
      return;
    }

    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("encrypts and decrypts values", () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key";

    const service = new EncryptionService();
    const cipherText = service.encrypt("secret-value");

    expect(cipherText).not.toBe("secret-value");
    expect(service.decrypt(cipherText)).toBe("secret-value");
  });
});
