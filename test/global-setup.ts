// Seeds the Docker Postgres once per run (see test/docker-compose.yml) and reloads PostgREST's schema cache.
import pg from 'pg'
import { PG_DDL, PG_URL, POSTGREST_URL, pgInsert } from './fixtures'

export default async function setup() {
  const client = new pg.Client({ connectionString: PG_URL })
  try {
    await client.connect()
  } catch (e) {
    throw new Error(`Postgres not reachable at ${PG_URL}. Start it: docker compose -f test/docker-compose.yml up -d --wait`, { cause: e })
  }
  await client.query(PG_DDL)
  const ins = pgInsert()
  await client.query(ins.text, ins.values)
  await client.query(`notify pgrst, 'reload schema'`)
  await client.end()
  // Wait until PostgREST sees the new table.
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${POSTGREST_URL}/orders?limit=1`).catch(() => null)
    if (res?.ok) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`PostgREST not ready at ${POSTGREST_URL}`)
}
