import QRCode from 'qrcode'
import type { QrRenderer } from '../../application/ports/qr-renderer'

export const qrcodeRenderer: QrRenderer = {
  // Medium error correction and a wide quiet zone scan reliably off a laptop screen.
  toDataUrl: (text) => QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 280 }),
}
