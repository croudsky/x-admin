import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

@Injectable()
export class EncryptionService {
  private readonly algorithm = "aes-256-gcm";

  encrypt(plainText: string) {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString("base64url"),
      authTag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(cipherText: string) {
    const key = this.getKey();
    const [ivPart, authTagPart, encryptedPart] = cipherText.split(".");

    if (!ivPart || !authTagPart || !encryptedPart) {
      throw new InternalServerErrorException("Encrypted secret has invalid format");
    }

    const iv = Buffer.from(ivPart, "base64url");
    const authTag = Buffer.from(authTagPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  private getKey() {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
      throw new InternalServerErrorException("ENCRYPTION_KEY is required");
    }

    return createHash("sha256").update(rawKey).digest();
  }
}
