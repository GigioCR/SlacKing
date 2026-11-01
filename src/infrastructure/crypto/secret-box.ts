import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { SecretBox } from '../../application/ports/secret-box'

// Seals the authenticator secret stored in the database with AES-256-GCM, so someone reading the
// database (a backup, an export, a database tool) cannot make sign-in codes. The master key is
// ENCRYPTION_KEY on Vercel; any long random string works (it is hashed to 32 bytes).
// Format: "v1.<iv>.<auth tag>.<ciphertext>", each base64url. A new random IV every time.

const VERSION = 'v1'

export class AesGcmSecretBox implements SecretBox {
  private readonly key: Buffer

  constructor(masterKey: string) {
    this.key = createHash('sha256').update(masterKey, 'utf8').digest()
  }

  seal(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
  }

  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split('.')
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error('Not a sealed value')
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    // Throws if the value was changed or sealed with another master key.
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  }
}
