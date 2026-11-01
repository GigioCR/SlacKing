/** Seals secrets before they are stored, and opens them only when needed. */
export interface SecretBox {
  seal(plain: string): string
  /** Throws if the sealed value is damaged or was sealed with a different master key. */
  open(sealed: string): string
}
