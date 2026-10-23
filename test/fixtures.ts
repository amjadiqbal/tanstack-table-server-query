// Shared seed data, column config and a plain-JS reference evaluator. Every adapter test runs the
// same cases against a real database and compares the result with the reference.
import { defineTableQuery, type ColumnsConfig, type TableQuery } from '../src'

export const PG_URL = process.env.TSQ_PG_URL ?? 'postgres://tsq:tsq@127.0.0.1:54329/tsq'
export const POSTGREST_URL = process.env.TSQ_POSTGREST_URL ?? 'http://127.0.0.1:54330'

export interface Order {
  id: number
  customer: string
  status: 'paid' | 'pending' | 'refunded'
  total: number
  placedAt: Date
  paid: boolean
  note: string | null
}

// Names that try to break LIKE patterns, PostgREST's filter syntax and SQL quoting.
const TRICKY = ['100% Juice', 'under_score Ltd', 'Quote "Co"', 'Back\\slash', "O'Brien", 'Comma, Inc', 'Paren (Ltd)', 'Dot.Com', 'acme lowercase']
const NAMES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Northwind', 'Stark', 'Wayne', 'Wonka', 'Cyberdyne', 'Soylent']
const STATUSES = ['paid', 'pending', 'refunded'] as const

export const ORDERS: Order[] = Array.from({ length: 64 }, (_, i) => {
  const id = i + 1
  const customer = i < TRICKY.length ? TRICKY[i] : `${NAMES[i % NAMES.length]} ${String.fromCharCode(65 + (i % 26))}${id}`
  return {
    id,
    customer,
    status: STATUSES[(i * 7) % 3],
    total: ((i * 37) % 50) * 100 + (i % 4) * 25, // ties on purpose
    placedAt: new Date(Date.UTC(2026, 0, 1 + (i % 40), (i * 5) % 24, 30)),
    paid: i % 3 !== 1,
    note: i % 5 === 0 ? null : `note ${id}`,
  }
})

/** Column ids are the same everywhere; `field` differs per adapter (TS property vs DB column). */
export function makeDefinition(fields: { placedAt: string }) {
  const columns = {
    id: { type: 'number' },
    customer: { type: 'string' },
    status: { type: 'enum', values: ['paid', 'pending', 'refunded'] },
    total: { type: 'number' },
    placedAt: { type: 'date', field: fields.placedAt },
    paid: { type: 'boolean' },
    note: { type: 'string', sortable: false },
  } satisfies ColumnsConfig
  return defineTableQuery({
    columns,
    tiebreaker: 'id',
    globalFilter: { columns: ['customer', 'note'] },
  })
}

/** Cases as a client would send them. Each is run through every adapter. */
export const CASES: Array<{ name: string; input: Record<string, unknown> | string }> = [
  { name: 'defaults: first page', input: {} },
  { name: 'sort desc + page 3 (URL)', input: '?sort=-total&page=3' },
  { name: 'multi sort', input: { sorting: [{ id: 'status', desc: false }, { id: 'total', desc: true }], pagination: { pageIndex: 1, pageSize: 7 } } },
  { name: 'enum eq', input: '?f.status=paid&size=50' },
  { name: 'enum in', input: { columnFilters: [{ id: 'status', value: ['pending', 'refunded'] }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'contains (case-insensitive)', input: '?f.customer=ACME&size=50' },
  { name: 'contains with % is literal', input: { columnFilters: [{ id: 'customer', value: '100%' }] } },
  { name: 'contains with _ is literal', input: { columnFilters: [{ id: 'customer', value: 'r_s' }] } },
  { name: 'contains a lone _ (no wildcard)', input: { columnFilters: [{ id: 'customer', value: '_' }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'contains a lone % (no wildcard)', input: { columnFilters: [{ id: 'customer', value: '%' }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'global filter is a lone _', input: { globalFilter: '_', pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'contains with backslash', input: { columnFilters: [{ id: 'customer', value: 'k\\s' }] } },
  { name: 'contains with quote', input: { columnFilters: [{ id: 'customer', value: '"co"' }] } },
  { name: 'contains with apostrophe', input: { columnFilters: [{ id: 'customer', value: "o'b" }] } },
  { name: 'startsWith / endsWith', input: { columnFilters: [{ id: 'customer', value: { op: 'startsWith', value: 'glo' } }, { id: 'note', value: { op: 'endsWith', value: '4' } }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'number range', input: '?f.total=[1000,2500]&sort=total&size=50' },
  { name: 'number range open + reversed', input: { columnFilters: [{ id: 'total', value: [null, 900] }, { id: 'id', value: [40, 10] }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'number explicit gt / ne / notIn', input: { columnFilters: [{ id: 'total', value: { op: 'gt', value: 2000 } }, { id: 'status', value: { op: 'ne', value: 'paid' } }, { id: 'id', value: { op: 'notIn', value: [12, 13, 14] } }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'date range (date-only, inclusive end)', input: '?f.placedAt=["2026-01-05","2026-01-09"]&sort=-placedAt&size=50' },
  { name: 'date single day', input: { columnFilters: [{ id: 'placedAt', value: '2026-01-10' }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'date datetime gte', input: { columnFilters: [{ id: 'placedAt', value: { op: 'gte', value: '2026-02-05T12:00:00Z' } }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'boolean', input: '?f.paid=false&size=50' },
  { name: 'isNull / isNotNull', input: { columnFilters: [{ id: 'note', value: { op: 'isNull' } }], pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'isNotNull + contains combo', input: { columnFilters: [{ id: 'note', value: { op: 'isNotNull' } }, { id: 'customer', value: 'a' }], pagination: { pageIndex: 1, pageSize: 10 } } },
  { name: 'global filter', input: '?q=wonka&size=50' },
  { name: 'global filter hits note', input: { globalFilter: 'note 1', pagination: { pageIndex: 0, pageSize: 50 } } },
  { name: 'global filter with comma and parens', input: { globalFilter: 'Comma, Inc' } },
  { name: 'global filter with quote and paren', input: { globalFilter: '(ltd)' } },
  { name: 'global filter with % and _', input: { globalFilter: '0%' } },
  { name: 'global + column filter', input: { globalFilter: 'a', columnFilters: [{ id: 'status', value: 'pending' }], sorting: [{ id: 'customer', desc: true }] } },
  { name: 'page past the end', input: '?page=99' },
  { name: 'no matches', input: { columnFilters: [{ id: 'customer', value: 'zzzz-nothing' }] } },
]

/** Evaluate a parsed query in plain JS (the expected result). */
export function reference(query: TableQuery, rows: Order[] = ORDERS) {
  const get = (r: Order, field: string): unknown => {
    const key = field === 'placed_at' ? 'placedAt' : field
    return r[key as keyof Order]
  }
  const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v)
  const match = rows.filter((r) => {
    for (const f of query.filters) {
      const raw = get(r, f.field)
      const v = norm(raw) as any
      const fv = Array.isArray(f.value) ? f.value.map(norm) : (norm(f.value) as any)
      const s = typeof raw === 'string' ? raw.toLowerCase() : ''
      const ok = (() => {
        switch (f.op) {
          case 'eq':
            return v !== null && v === fv
          case 'ne':
            return v !== null && v !== fv
          case 'lt':
            return v !== null && v < fv
          case 'lte':
            return v !== null && v <= fv
          case 'gt':
            return v !== null && v > fv
          case 'gte':
            return v !== null && v >= fv
          case 'in':
            return v !== null && (fv as unknown[]).includes(v)
          case 'notIn':
            return v !== null && !(fv as unknown[]).includes(v)
          case 'isNull':
            return v === null
          case 'isNotNull':
            return v !== null
          case 'contains':
            return raw !== null && s.includes(String(fv).toLowerCase())
          case 'startsWith':
            return raw !== null && s.startsWith(String(fv).toLowerCase())
          case 'endsWith':
            return raw !== null && s.endsWith(String(fv).toLowerCase())
        }
      })()
      if (!ok) return false
    }
    if (query.globalFilter) {
      const needle = query.globalFilter.value.toLowerCase()
      if (!query.globalFilter.fields.some((f) => String(get(r, f) ?? '\u0000').toLowerCase().includes(needle))) return false
    }
    return true
  })
  const sorted = [...match].sort((a, b) => {
    for (const s of query.sorting) {
      const x = norm(get(a, s.field)) as any
      const y = norm(get(b, s.field)) as any
      if (x < y) return s.desc ? 1 : -1
      if (x > y) return s.desc ? -1 : 1
    }
    return 0
  })
  const { offset, limit } = query.pagination
  return { ids: sorted.slice(offset, offset + limit).map((r) => r.id), rowCount: match.length }
}

export const PG_DDL = `
drop table if exists orders;
create table orders (
  id integer primary key,
  customer text not null,
  status text not null,
  total double precision not null,
  placed_at timestamptz not null,
  paid boolean not null,
  note text
);`

export function pgInsert(): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const rows = ORDERS.map((o) => {
    const base = values.length
    values.push(o.id, o.customer, o.status, o.total, o.placedAt, o.paid, o.note)
    return `(${Array.from({ length: 7 }, (_, i) => `$${base + i + 1}`).join(',')})`
  })
  return { text: `insert into orders (id, customer, status, total, placed_at, paid, note) values ${rows.join(',')}`, values }
}
