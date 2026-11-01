// Prints fresh values for every secret the app needs, ready to paste into the Vercel project's
// Environment Variables. Nothing is saved; run it again for new ones.
//
//   npm run secrets

import { randomBytes } from 'node:crypto'
import webpush from 'web-push'

const random = () => randomBytes(32).toString('base64url')
const vapid = webpush.generateVAPIDKeys()

const values = {
  WEBHOOK_SECRET: random(),
  SETUP_CODE: random(),
  SESSION_SECRET: random(),
  ENCRYPTION_KEY: random(),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
}

for (const [name, value] of Object.entries(values)) console.log(`${name}=${value}`)
console.log('VAPID_SUBJECT=mailto:<your email>')
console.log('\nAlso set DATABASE_URL (and optionally DATABASE_CA_CERT); see README.md.')
console.log('Keep SETUP_CODE somewhere safe: it is how you link a new phone if you lose this one.')
