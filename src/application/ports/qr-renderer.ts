export interface QrRenderer {
  /** An image of `text` as a QR code, as a data: URL. */
  toDataUrl(text: string): Promise<string>
}
