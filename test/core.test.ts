import { describe, expect, it } from 'vitest'
import { encodeState, resolveCodec } from '@amjadiqbal/tanstack-table-url-state/core'
import { defineTableQuery, escapeLike, likePattern, TableQueryError, toTablePage } from '../src'

const def = defineTableQuery({
  columns: {
    id: { type: 'number' },
    customer: { type: 'string' },
    email: { type: 'string', ops: ['eq'], defaultOp: 'eq', sortable: false },
    status: { type: 'enum', values: ['paid', 'pending'] },
    total: { type: 'number', field: 'total_cents' },
    placedAt: { type: 'date', field: 'placed_at' },
    paid: { type: 'boolean' },
    secret: { type: 'string', filterable: false, sortable: false },
  },
  defaultSorting: [{ id: 'placedAt', desc: true }],
  tiebreaker: 'id',
  globalFilter: { columns: ['customer', 'email'] },
})

const errorOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e as TableQueryError
  }
  throw new Error('expected a throw')
}

describe('input shapes', () => {
  it('reads table state', () => {
    const q = def.parse({
      sorting: [{ id: 'total', desc: true }],
      columnFilters: [{ id: 'status', value: 'paid' }],
      globalFilter: ' acme ',
      pagination: { pageIndex: 2, pageSize: 25 },
    })
    expect(q.sorting).toEqual([
      { id: 'total', field: 'total_cents', desc: true },
      { id: 'id', field: 'id', desc: false },
    ])
    expect(q.filters).toEqual([{ id: 'status', field: 'status', type: 'enum', op: 'eq', value: 'paid' }])
    expect(q.globalFilter).toEqual({ value: 'acme', fields: ['customer', 'email'] })
    expect(q.pagination).toEqual({ pageIndex: 2, pageSize: 25, offset: 50, limit: 25 })
  })

  it('reads URLSearchParams, query strings and search objects the same way', () => {
    const s = '?sort=-total,customer&f.status=paid&f.total=[100,500]&q=acme&page=3&size=20'
    const a = def.parse(s)
    expect(def.parse(new URLSearchParams(s))).toEqual(a)
    // TanStack Router's default search parser has already turned JSON-looking values into values.
    expect(def.parse({ sort: '-total,customer', 'f.status': 'paid', 'f.total': [100, 500], q: 'acme', page: 3, size: 20 })).toEqual(a)
    expect(a.sorting.map((s) => [s.id, s.desc])).toEqual([
      ['total', true],
      ['customer', false],
      ['id', false],
    ])
    expect(a.filters.map((f) => [f.id, f.op, f.value])).toEqual([
      ['status', 'eq', 'paid'],
      ['total', 'gte', 100],
      ['total', 'lte', 500],
    ])
    expect(a.pagination).toEqual({ pageIndex: 2, pageSize: 20, offset: 40, limit: 20 })
  })

  it('reads exactly what @amjadiqbal/tanstack-table-url-state writes', () => {
    const state = {
      sorting: [{ id: 'total', desc: true }],
      columnFilters: [
        { id: 'customer', value: 'acme, inc' },
        { id: 'total', value: [100, 5000] },
        { id: 'placedAt', value: ['2026-01-01', '2026-01-31'] },
        { id: 'paid', value: true },
      ],
      globalFilter: '42',
      pagination: { pageIndex: 4, pageSize: 50 },
      columnVisibility: { email: false },
    }
    const patch = encodeState(state, resolveCodec({ prefix: 'o.' }))
    const params = new URLSearchParams(Object.entries(patch).filter(([, v]) => v !== undefined) as [string, string][])
    const q = defineTableQuery({ columns: def.columns, globalFilter: { columns: ['customer'] }, prefix: 'o.' }).parse(params)
    expect(q.sorting).toEqual([{ id: 'total', field: 'total_cents', desc: true }])
    expect(q.filters.map((f) => [f.id, f.op, f.value instanceof Date ? f.value.toISOString() : f.value])).toEqual([
      ['customer', 'contains', 'acme, inc'],
      ['total', 'gte', 100],
      ['total', 'lte', 5000],
      ['placedAt', 'gte', '2026-01-01T00:00:00.000Z'],
      ['placedAt', 'lt', '2026-02-01T00:00:00.000Z'],
      ['paid', 'eq', true],
    ])
    expect(q.globalFilter?.value).toBe('42')
    expect(q.pagination).toEqual({ pageIndex: 4, pageSize: 50, offset: 200, limit: 50 })
  })

  it('uses defaults when the input is empty', () => {
    const q = def.parse({})
    expect(q.sorting).toEqual([
      { id: 'placedAt', field: 'placed_at', desc: true },
      { id: 'id', field: 'id', desc: false },
    ])
    expect(q.filters).toEqual([])
    expect(q.globalFilter).toBeNull()
    expect(q.pagination).toEqual({ pageIndex: 0, pageSize: 10, offset: 0, limit: 10 })
  })

  it('ignores params it does not own', () => {
    expect(def.parse('?tab=2&hide=email&utm_source=x').filters).toEqual([])
  })
})

describe('filters', () => {
  const f = (value: unknown, id = 'total') => def.parse({ columnFilters: [{ id, value }] }).filters
  const iso = (fs: ReturnType<typeof f>) => fs.map((x) => [x.op, x.value instanceof Date ? x.value.toISOString() : x.value])

  it('maps plain values by column type', () => {
    expect(iso(f('acme', 'customer'))).toEqual([['contains', 'acme']])
    expect(iso(f('a@b.c', 'email'))).toEqual([['eq', 'a@b.c']])
    expect(iso(f(['paid', 'pending'], 'status'))).toEqual([['in', ['paid', 'pending']]])
    expect(iso(f('42'))).toEqual([['eq', 42]])
    expect(iso(f('false', 'paid'))).toEqual([['eq', false]])
    expect(iso(f(['x', 'y'], 'customer'))).toEqual([['in', ['x', 'y']]])
  })

  it('treats number and date arrays as ranges like Table\'s inNumberRange / inDateRange', () => {
    expect(iso(f([10, 20]))).toEqual([['gte', 10], ['lte', 20]])
    expect(iso(f([20, 10]))).toEqual([['gte', 10], ['lte', 20]])
    expect(iso(f(['', 20]))).toEqual([['lte', 20]])
    expect(iso(f([10, null]))).toEqual([['gte', 10]])
    expect(f([null, ''])).toEqual([])
    expect(iso(f(['2026-03-10', '2026-03-01'], 'placedAt'))).toEqual([
      ['gte', '2026-03-01T00:00:00.000Z'],
      ['lt', '2026-03-11T00:00:00.000Z'],
    ])
    expect(iso(f(['2026-03-01T08:00:00Z', '2026-03-01T17:00:00Z'], 'placedAt'))).toEqual([
      ['gte', '2026-03-01T08:00:00.000Z'],
      ['lte', '2026-03-01T17:00:00.000Z'],
    ])
  })

  it('treats a date-only value as the whole UTC day', () => {
    expect(iso(f('2026-03-01', 'placedAt'))).toEqual([
      ['gte', '2026-03-01T00:00:00.000Z'],
      ['lt', '2026-03-02T00:00:00.000Z'],
    ])
    expect(iso(f({ op: 'lte', value: '2026-03-01' }, 'placedAt'))).toEqual([['lt', '2026-03-02T00:00:00.000Z']])
    expect(iso(f({ op: 'gt', value: '2026-03-01' }, 'placedAt'))).toEqual([['gte', '2026-03-02T00:00:00.000Z']])
  })

  it('accepts explicit { op, value }', () => {
    expect(iso(f({ op: 'gt', value: 5 }))).toEqual([['gt', 5]])
    expect(iso(f({ op: 'between', value: [1, 2] }))).toEqual([['gte', 1], ['lte', 2]])
    expect(iso(f({ op: 'notIn', value: [1, 2] }))).toEqual([['notIn', [1, 2]]])
    expect(iso(f({ op: 'isNull' }, 'customer'))).toEqual([['isNull', null]])
    expect(iso(f({ op: 'startsWith', value: 'ac' }, 'customer'))).toEqual([['startsWith', 'ac']])
  })

  it('drops empty filters like Table does', () => {
    expect(f('')).toEqual([])
    expect(f(null)).toEqual([])
    expect(f([], 'status')).toEqual([])
  })
})

describe('rejects anything outside the allow-list', () => {
  const bad = (input: Parameters<typeof def.parse>[0]) => errorOf(() => def.parse(input)).issues.map((i) => i.message).join(' | ')

  it('unknown and blocked columns', () => {
    expect(bad({ sorting: [{ id: 'password', desc: false }] })).toMatch(/unknown column "password"/)
    expect(bad({ columnFilters: [{ id: 'password', value: 'x' }] })).toMatch(/unknown column/)
    expect(bad({ columnFilters: [{ id: 'secret', value: 'x' }] })).toMatch(/not filterable/)
    expect(bad({ sorting: [{ id: 'secret', desc: false }] })).toMatch(/not sortable/)
    expect(bad('?sort=__proto__')).toMatch(/unknown column "__proto__"/)
    expect(bad('?f.constructor=1')).toMatch(/unknown column "constructor"/)
  })

  it('operators that are not allowed for the column', () => {
    expect(bad({ columnFilters: [{ id: 'email', value: { op: 'contains', value: 'a' } }] })).toMatch(/"contains" is not allowed/)
    expect(bad({ columnFilters: [{ id: 'status', value: { op: 'contains', value: 'p' } }] })).toMatch(/not allowed/)
    expect(bad({ columnFilters: [{ id: 'total', value: { op: 'raw', value: '1=1' } }] })).toMatch(/unknown operator "raw"/)
    expect(bad({ columnFilters: [{ id: 'paid', value: { op: 'gt', value: true } }] })).toMatch(/not allowed/)
  })

  it('values of the wrong type', () => {
    expect(bad({ columnFilters: [{ id: 'total', value: 'abc' }] })).toMatch(/expected a number/)
    expect(bad({ columnFilters: [{ id: 'status', value: 'deleted' }] })).toMatch(/not one of the allowed values/)
    expect(bad({ columnFilters: [{ id: 'placedAt', value: 'yesterday' }] })).toMatch(/expected a date/)
    expect(bad({ columnFilters: [{ id: 'paid', value: 'yes' }] })).toMatch(/true or false/)
    expect(bad({ columnFilters: [{ id: 'customer', value: { op: 'contains', value: { $ne: 1 } } }] })).toMatch(/expected a string/)
    expect(bad({ columnFilters: [{ id: 'total', value: { op: 'in', value: 5 } }] })).toMatch(/needs an array/)
  })

  it('limits', () => {
    expect(bad({ pagination: { pageIndex: 0, pageSize: 5000 } })).toMatch(/at most 100/)
    expect(bad({ pagination: { pageIndex: 10_001, pageSize: 10 } })).toMatch(/at most 10000/)
    expect(bad({ pagination: { pageIndex: -1, pageSize: 10 } })).toMatch(/>= 0/)
    expect(bad('?page=0')).toMatch(/>= 1/)
    expect(bad('?size=1e9')).toMatch(/>= 1/)
    expect(bad({ columnFilters: [{ id: 'customer', value: 'x'.repeat(201) }] })).toMatch(/longer than 200/)
    expect(bad({ globalFilter: 'x'.repeat(201) })).toMatch(/longer than 200/)
    expect(bad({ columnFilters: [{ id: 'id', value: { op: 'in', value: Array.from({ length: 101 }, (_, i) => i) } }] })).toMatch(/at most 100 values/)
    expect(bad({ sorting: ['id', 'customer', 'total', 'paid'].map((id) => ({ id, desc: false })) })).toMatch(/at most 3 sort/)
    expect(bad({ columnFilters: Array.from({ length: 21 }, () => ({ id: 'customer', value: 'a' })) })).toMatch(/at most 20 filters/)
  })

  it('global filter only where enabled', () => {
    const noGlobal = defineTableQuery({ columns: { name: { type: 'string' } } })
    expect(errorOf(() => noGlobal.parse({ globalFilter: 'x' })).message).toMatch(/not enabled/)
    expect(bad({ globalFilter: { $regex: '.*' } })).toMatch(/expected a string/)
  })

  it('collects every issue with its path, and carries status 400', () => {
    const e = errorOf(() => def.parse({ sorting: [{ id: 'nope', desc: false }], columnFilters: [{ id: 'total', value: 'x' }] }))
    expect(e).toBeInstanceOf(TableQueryError)
    expect(e.status).toBe(400)
    expect(e.issues.map((i) => i.path)).toEqual([
      ['sorting', 0],
      ['columnFilters', 0],
    ])
  })

  it('rejects non-object input', () => {
    expect(errorOf(() => def.parse(42 as never)).message).toMatch(/expected table state/)
  })
})

describe("invalid: 'ignore'", () => {
  const lenient = defineTableQuery({ columns: def.columns, invalid: 'ignore', maxPageSize: 50 })

  it('drops bad parts, keeps the rest and lists issues', () => {
    const q = lenient.parse('?sort=-nope,customer&f.total=abc&f.status=paid&size=500&page=2')
    expect(q.sorting.map((s) => s.id)).toEqual(['customer'])
    expect(q.filters.map((f) => f.id)).toEqual(['status'])
    expect(q.pagination).toEqual({ pageIndex: 1, pageSize: 50, offset: 50, limit: 50 })
    expect(q.issues.map((i) => i.path[0])).toEqual(['sorting', 'columnFilters', 'pagination'])
  })
})

describe('config errors are thrown at define time', () => {
  it('rejects bad definitions', () => {
    expect(() => defineTableQuery({ columns: { s: { type: 'enum' } } })).toThrow(/need `values`/)
    expect(() => defineTableQuery({ columns: { s: { type: 'boolean', ops: ['contains'] } } })).toThrow(/does not apply/)
    expect(() => defineTableQuery({ columns: { n: { type: 'number' } }, globalFilter: { columns: ['n'] } })).toThrow(/not a string column/)
    expect(() => defineTableQuery({ columns: { n: { type: 'number' } }, defaultSorting: [{ id: 'x' as 'n' }] })).toThrow(/unknown column "x"/)
  })
})

describe('Standard Schema', () => {
  it('validates like safeParse', () => {
    const ok = def['~standard'].validate({ pagination: { pageIndex: 1, pageSize: 10 } })
    expect('value' in ok && ok.value.pagination.offset).toBe(10)
    const no = def['~standard'].validate({ sorting: [{ id: 'nope', desc: true }] })
    expect(no.issues?.[0]).toMatchObject({ path: ['sorting', 0] })
    expect(def['~standard'].version).toBe(1)
  })

  it('safeParse never throws for bad input', () => {
    const r = def.safeParse({ columnFilters: 'x' } as never)
    expect(r.success).toBe(false)
  })
})

describe('helpers', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(likePattern('startsWith', 'a%')).toBe('a\\%%')
    expect(likePattern('endsWith', 'a')).toBe('%a')
  })

  it('computes page counts', () => {
    expect(toTablePage([1, 2], 21, { pagination: { pageIndex: 2, pageSize: 10, offset: 20, limit: 10 } })).toEqual({
      rows: [1, 2],
      rowCount: 21,
      pageCount: 3,
      pageIndex: 2,
      pageSize: 10,
    })
  })
})
