import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { EventRepository } from '../src/application/ports/event-repository'
import { clearEvent, clearEvents } from '../src/application/use-cases/clear-events'
import { listEvents } from '../src/application/use-cases/list-events'
import { NO_PROMPT, type AgentEvent } from '../src/domain/agent-event'
import { InMemoryEventRepository } from '../src/infrastructure/persistence/in-memory/repositories'
import { PostgresEventRepository } from '../src/infrastructure/persistence/postgres/event-repository'
import { createPool } from '../src/infrastructure/persistence/postgres/pool'

// The same behaviour is checked on the in-memory store and, when TEST_DATABASE_URL points at a
// database (the Docker one from docker-compose.yml), on Postgres, whose SQL does the real paging.
//   $env:TEST_DATABASE_URL = "postgresql://slacking:slacking@localhost:54432/slacking"; npm test
// That database's agent_events table is emptied before each test.

const testDb = process.env.TEST_DATABASE_URL
const pool = testDb ? createPool({ connectionString: testDb, caCert: null }) : null
afterAll(() => pool?.end())

const stores: [string, () => Promise<EventRepository>][] = [['in memory', async () => new InMemoryEventRepository()]]
if (pool) {
  stores.push([
    'postgres',
    async () => {
      await pool.query('delete from agent_events')
      return new PostgresEventRepository(pool)
    },
  ])
}

// Ids are uuids so Postgres accepts them; their order is the hex order.
const clock = { now: () => new Date('2026-11-01T12:00:00Z') }

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function event(n: number, at: string): AgentEvent {
  return {
    id: uuid(n),
    kind: 'finished',
    sessionId: 's',
    sessionTitle: `Event ${n}`,
    project: 'p',
    summary: 'x',
    context: null,
    receivedAt: new Date(at),
    ...NO_PROMPT,
  }
}

describe.each(stores)('inbox paging and clearing (%s)', (_name, makeStore) => {
  let store: EventRepository
  beforeEach(async () => {
    store = await makeStore()
  })

  async function addMinutes(count: number) {
    for (let n = 1; n <= count; n++) {
      await store.add(event(n, `2026-11-01T10:${String(n).padStart(2, '0')}:00Z`))
    }
  }

  it('pages newest first and says how many there are', async () => {
    await addMinutes(7)
    const list = listEvents({ events: store, clock })
    const first = await list({ limit: 3 })
    expect(first.events.map((e) => e.sessionTitle)).toEqual(['Event 7', 'Event 6', 'Event 5'])
    expect(first.total).toBe(7)
    const second = await list({ limit: 3, cursor: first.nextCursor })
    expect(second.events.map((e) => e.sessionTitle)).toEqual(['Event 4', 'Event 3', 'Event 2'])
    const last = await list({ limit: 3, cursor: second.nextCursor })
    expect(last.events.map((e) => e.sessionTitle)).toEqual(['Event 1'])
    expect(last.nextCursor).toBeNull()
  })

  it('has no next page when the last page is exactly full', async () => {
    await addMinutes(3)
    expect((await listEvents({ events: store, clock })({ limit: 3 })).nextCursor).toBeNull()
  })

  it('neither skips nor repeats events that arrived at the same moment', async () => {
    for (let n = 1; n <= 5; n++) await store.add(event(n, '2026-11-01T10:00:00Z'))
    const list = listEvents({ events: store, clock })
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page = await list({ limit: 2, cursor })
      seen.push(...page.events.map((e) => e.sessionTitle))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(['Event 5', 'Event 4', 'Event 3', 'Event 2', 'Event 1'])
  })

  it('clears one notification, and clearing it again is fine', async () => {
    await addMinutes(2)
    const clear = clearEvent({ events: store })
    expect(await clear(uuid(1))).toEqual({ cleared: 1 })
    expect(await clear(uuid(1))).toEqual({ cleared: 0 })
    expect(await store.count()).toBe(1)
  })

  it('clears all up to the newest one on screen, keeping any that arrived since', async () => {
    await addMinutes(4)
    const result = await clearEvents({ events: store })('2026-11-01T10:03:00.000Z')
    expect(result).toEqual({ cleared: 3 })
    expect((await listEvents({ events: store, clock })()).events.map((e) => e.sessionTitle)).toEqual(['Event 4'])
  })
})

describe('inbox input checks', () => {
  const store = new InMemoryEventRepository()

  it('refuses a damaged page link or a silly page size', async () => {
    await expect(listEvents({ events: store, clock })({ cursor: 'garbage' })).rejects.toThrow(/page link/)
    await expect(listEvents({ events: store, clock })({ limit: '500' })).rejects.toThrow(/limit/)
  })

  it('refuses clear-all without a time', async () => {
    await expect(clearEvents({ events: store })('yesterday-ish')).rejects.toThrow(/upTo/)
  })
})
