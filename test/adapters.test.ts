// Every adapter, against a real database, must return exactly what the JS reference returns.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import Database from 'better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { boolean, doublePrecision, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { integer as sInteger, real, sqliteTable, text as sText } from 'drizzle-orm/sqlite-core'
import { Kysely, PostgresDialect } from 'kysely'
import { PostgrestClient } from '@supabase/postgrest-js'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './prisma/generated/client'
import { queryDrizzle, toDrizzle } from '../src/drizzle'
import { applyKysely, queryKysely } from '../src/kysely'
import { queryPrisma } from '../src/prisma'
import { querySupabase } from '../src/supabase'
import { defineTableQuery, type TablePage, type TableQuery } from '../src'
import { CASES, ORDERS, PG_URL, POSTGREST_URL, makeDefinition, reference } from './fixtures'

const pgOrders = pgTable('orders', {
  id: integer().primaryKey(),
  customer: text().notNull(),
  status: text().notNull(),
  total: doublePrecision().notNull(),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
  paid: boolean().notNull(),
  note: text(),
})

const sqliteOrders = sqliteTable('orders', {
  id: sInteger().primaryKey(),
  customer: sText().notNull(),
  status: sText().notNull(),
  total: real().notNull(),
  placedAt: sInteger('placed_at', { mode: 'timestamp_ms' }).notNull(),
  paid: sInteger({ mode: 'boolean' }).notNull(),
  note: sText(),
})

const byProperty = makeDefinition({ placedAt: 'placedAt' }) // Drizzle and Prisma use TS property names
const byColumn = makeDefinition({ placedAt: 'placed_at' }) // Kysely and PostgREST use DB column names

let pool: pg.Pool
let sqlite: Database.Database
let prisma: PrismaClient
let kysely: Kysely<any>

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: PG_URL, max: 4 })
  kysely = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: PG_URL, max: 2 }) }) })
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: PG_URL }) })
  sqlite = new Database(':memory:')
  sqlite.exec(`create table orders (id integer primary key, customer text not null, status text not null, total real not null,
    placed_at integer not null, paid integer not null, note text)`)
  await drizzleSqlite(sqlite).insert(sqliteOrders).values(ORDERS)
})

afterAll(async () => {
  await pool.end()
  await kysely.destroy()
  await prisma.$disconnect()
  sqlite.close()
})

type Runner = (q: TableQuery) => Promise<TablePage<{ id: number }>>

const runners: Array<{ name: string; def: typeof byProperty; run: Runner }> = [
  { name: 'Drizzle + Postgres (node-postgres)', def: byProperty, run: (q) => queryDrizzle(drizzlePg(pool), pgOrders, q) },
  { name: 'Drizzle + SQLite (better-sqlite3)', def: byProperty, run: (q) => queryDrizzle(drizzleSqlite(sqlite), sqliteOrders, q) },
  { name: 'Prisma 7 + Postgres (adapter-pg)', def: byProperty, run: (q) => queryPrisma(prisma.order, q) },
  { name: 'Kysely + Postgres', def: byColumn, run: (q) => queryKysely(kysely, 'orders', q) },
  { name: 'Supabase (postgrest-js) + PostgREST 13', def: byColumn, run: (q) => querySupabase(new PostgrestClient(POSTGREST_URL).from('orders'), q) },
]

for (const r of runners) {
  describe(r.name, () => {
    for (const c of CASES) {
      it(c.name, async () => {
        const query = r.def.parse(c.input)
        const expected = reference(query)
        const page = await r.run(query)
        expect(page.rows.map((row) => row.id)).toEqual(expected.ids)
        expect(page.rowCount).toBe(expected.rowCount)
        expect(page.pageCount).toBe(Math.ceil(expected.rowCount / query.pagination.pageSize))
      })
    }

    it('reference cases are not trivially empty', () => {
      const nonEmpty = CASES.filter((c) => reference(r.def.parse(c.input)).ids.length > 0)
      expect(nonEmpty.length).toBeGreaterThan(CASES.length - 3)
    })
  })
}

describe('Drizzle parts', () => {
  it('binds values as parameters, never inline', () => {
    const q = byProperty.parse({ columnFilters: [{ id: 'customer', value: "x'; drop table orders; --" }], globalFilter: 'y' })
    const { where } = toDrizzle(q, pgOrders)
    const built = drizzlePg(pool).select().from(pgOrders).where(where).toSQL()
    expect(built.sql).not.toContain('drop table')
    expect(built.params).toContain("%x'; drop table orders; --%")
  })

  it('accepts a field map for joins and computed columns', async () => {
    const q = makeDefinition({ placedAt: 'when' }).parse({ columnFilters: [{ id: 'placedAt', value: '2026-01-10' }], pagination: { pageIndex: 0, pageSize: 50 } })
    const fields = { id: pgOrders.id, when: pgOrders.placedAt, customer: pgOrders.customer, note: pgOrders.note }
    const { where, orderBy } = toDrizzle(q, fields)
    const rows = await drizzlePg(pool).select({ id: pgOrders.id }).from(pgOrders).where(where).orderBy(...orderBy)
    expect(rows.map((x) => x.id)).toEqual(reference(byProperty.parse({ columnFilters: [{ id: 'placedAt', value: '2026-01-10' }], pagination: { pageIndex: 0, pageSize: 50 } })).ids)
  })

  it('throws for a field the Drizzle table does not have', () => {
    const q = makeDefinition({ placedAt: 'nope' }).parse({ sorting: [{ id: 'placedAt', desc: false }] })
    expect(() => toDrizzle(q, pgOrders)).toThrow(/"nope" is not a column/)
  })
})

describe('Kysely parts', () => {
  it('works with an aliased table and qualified fields', async () => {
    const aliased = defineTableQuery({
      columns: { customer: { type: 'string', field: 'o.customer' }, total: { type: 'number', field: 'o.total' } },
      tiebreaker: 'o.id',
      globalFilter: { columns: ['customer'] },
    })
    const input = { sorting: [{ id: 'total', desc: true }], columnFilters: [{ id: 'total', value: [500, 3000] }], globalFilter: 'a', pagination: { pageIndex: 1, pageSize: 5 } }
    const rows = await applyKysely(kysely.selectFrom('orders as o').select(['o.id', 'o.total']), aliased.parse(input)).execute()
    expect(rows.map((r) => r.id)).toEqual(reference(byColumn.parse(input)).ids)
  })
})
