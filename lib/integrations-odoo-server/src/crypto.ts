import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// AES-256-GCM at rest for the Odoo API key. ENCRYPTION_KEY must be a 32-byte
// key, hex-encoded (64 hex chars) — generate with `openssl rand -hex 32`.
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("ENCRYPTION_KEY must be set (32-byte hex string — generate with `openssl rand -hex 32`)");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

/** Returns "iv:authTag:ciphertext", each base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}