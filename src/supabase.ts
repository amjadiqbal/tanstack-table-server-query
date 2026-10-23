import { escapeLike, toTablePage, type FilterValue, type QueryFilter, type TableQuery, type TablePage } from './core'

/**
 * The PostgREST filter builder methods this adapter calls. `supabase.from('orders').select(...)`
 * (supabase-js) and `@supabase/postgrest-js` builders both have them.
 */
export interface PostgrestBuilder<Self> {
  eq(column: string, value: unknown): Self
  neq(column: string, value: unknown): Self
  gt(column: string, value: unknown): Self
  gte(column: string, value: unknown): Self
  lt(column: string, value: unknown): Self
  lte(column: string, value: unknown): Self
  in(column: string, values: readonly unknown[]): Self
  is(column: string, value: null): Self
  not(column: string, operator: string, value: unknown): Self
  ilike(column: string, pattern: string): Self
  or(filters: string): Self
  order(column: string, options?: { ascending?: boolean }): Self
  range(from: number, to: number): Self
}

/**
 * Apply filters, global filter, ordering and `range()` to a PostgREST select builder.
 * Call `.select('*', { count: 'exact' })` first to get the total in the same request.
 */
export function applySupabase<B extends PostgrestBuilder<B>>(builder: B, query: TableQuery): B {
  let b = applySupabaseFilters(builder, query)
  for (const s of query.sorting) b = b.order(s.field, { ascending: !s.desc })
  const { offset, limit } = query.pagination
  return b.range(offset, offset + limit - 1)
}

/** Filters and global filter only. */
export function applySupabaseFilters<B extends PostgrestBuilder<B>>(builder: B, query: TableQuery): B {
  let b = builder
  for (const f of query.filters) b = condition(b, f)
  if (query.globalFilter) {
    const pattern = quote(`%${escapeLike(query.globalFilter.value)}%`)
    b = b.or(query.globalFilter.fields.map((field) => `${field}.ilike.${pattern}`).join(','))
  }
  return b
}

/** A select builder from `supabase.from(table)` (or postgrest-js `client.from(table)`). */
export interface PostgrestQueryBuilder {
  select(columns: string, options: { count: 'exact'; head?: boolean }): any
}

/**
 * `supabase.from('orders')` → rows plus counts in one request (`count: 'exact'`).
 * Throws the PostgREST error if the request fails.
 */
export async function querySupabase<Row = Record<string, unknown>>(
  from: PostgrestQueryBuilder,
  query: TableQuery,
  columns = '*',
): Promise<TablePage<Row>> {
  type Res = { data: Row[] | null; count: number | null; status?: number; error: { code?: string } | null }
  const res = (await applySupabase(from.select(columns, { count: 'exact' }), query)) as Res
  // PostgREST answers 416 (PGRST103) for a page past the end; count without rows instead.
  // PostgREST 13.0.7 truncates that error body, so the status is checked too.
  if (res.status === 416 || res.error?.code === 'PGRST103') {
    const head = (await applySupabaseFilters(from.select(columns, { count: 'exact', head: true }), query)) as Res
    if (head.error) throw head.error
    return toTablePage([], head.count ?? 0, query)
  }
  if (res.error) throw res.error
  return toTablePage(res.data ?? [], res.count ?? 0, query)
}

const toApi = (v: FilterValue) => (v instanceof Date ? v.toISOString() : v)

/** Double-quote a value for PostgREST's `or=(...)` / `in.(...)` syntax. */
function quote(v: FilterValue): string {
  return '"' + String(toApi(v)).replace(/[\\"]/g, (c) => '\\' + c) + '"'
}

function condition<B extends PostgrestBuilder<B>>(b: B, f: QueryFilter): B {
  const v = f.value as FilterValue
  switch (f.op) {
    case 'eq':
      return b.eq(f.field, toApi(v))
    case 'ne':
      return b.neq(f.field, toApi(v))
    case 'lt':
      return b.lt(f.field, toApi(v))
    case 'lte':
      return b.lte(f.field, toApi(v))
    case 'gt':
      return b.gt(f.field, toApi(v))
    case 'gte':
      return b.gte(f.field, toApi(v))
    case 'in':
      return b.in(f.field, (f.value as FilterValue[]).map(toApi))
    case 'notIn':
      return b.not(f.field, 'in', `(${(f.value as FilterValue[]).map(quote).join(',')})`)
    case 'isNull':
      return b.is(f.field, null)
    case 'isNotNull':
      return b.not(f.field, 'is', null)
    case 'contains':
      return b.ilike(f.field, `%${escapeLike(v as string)}%`)
    case 'startsWith':
      return b.ilike(f.field, `${escapeLike(v as string)}%`)
    case 'endsWith':
      return b.ilike(f.field, `%${escapeLike(v as string)}`)
  }
}
