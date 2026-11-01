import { randomUUID } from 'node:crypto'
import type { IdGenerator } from '../../application/ports/id-generator'

export const uuidGenerator: IdGenerator = { next: () => randomUUID() }
