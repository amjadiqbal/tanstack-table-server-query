import { escapeLike, toTablePage, type FilterValue, type QueryFilter, type TableQuery, type TablePage } from './core'

export interface PrismaOptions {
  /**
   * Add `mode: 'insensitive'` to `contains` / `startsWith` / `endsWith` and the global filter.
   * Default `true`. Prisma supports it on PostgreSQL and MongoDB only; set `false` for SQLite and MySQL.
   */
  insensitive?: boolean
  /**
   * Escape `%`, `_` and `\\` in `contains` / `startsWith` / `endsWith` values. Default `true`.
   * Prisma passes them to LIKE unescaped, so without this `50%` matches `50` followed by anything.
   * There is no ESCAPE clause, so this relies on `\\` being the database's default LIKE escape
   * character, as on PostgreSQL (the only database this adapter is tested on).
   */
  escapeWildcards?: boolean
}

export interface PrismaFindManyArgs {
  where: Record<string, unknown>
  orderBy: Array<Record<string, 'asc' | 'desc'>>
  skip: number
  take: number
}

/**
 * Build Prisma `findMany` arguments (`where`, `orderBy`, `skip`, `take`) from a parsed table query.
 * Plain objects only, so it works with any generated client. Spread them into `findMany`.
 */
export function toPrisma(query: TableQuery, options: PrismaOptions = {}): PrismaFindManyArgs {
  return {
    where: prismaWhere(query, options),
    orderBy: query.sorting.map((s) => ({ [s.field]: s.desc ? 'desc' : 'asc' })),
    skip: query.pagination.offset,
    take: query.pagination.limit,
  }
}

/** Only the `where` object, e.g. for `count({ where })`. */
export function prismaWhere(query: TableQuery, options: PrismaOptions = {}): Record<string, unknown> {
  const mode = options.insensitive === false ? {} : { mode: 'insensitive' }
  const esc = options.escapeWildcards === false ? (v: string) => v : escapeLike
  const and: Record<string, unknown>[] = query.filters.map((f) => ({ [f.field]: condition(f, mode, esc) }))
  if (query.globalFilter) {
    const value = esc(query.globalFilter.value)
    and.push({ OR: query.globalFilter.fields.map((field) => ({ [field]: { contains: value, ...mode } })) })
  }
  return and.length ? { AND: and } : {}
}

/** The part of a Prisma model delegate (`prisma.order`) that `queryPrisma` uses. */
export interface PrismaDelegate<Row> {
  findMany(args: any): PromiseLike<Row[]>
  count(args: any): PromiseLike<number>
}

/**
 * Run `findMany` and `count` with the same `where` and return rows plus counts. `extra` is merged into
 * `findMany` (e.g. `select`, `include`).
 * The two queries run at the same time, not in a transaction; see "Consistent counts" in the README.
 */
export async function queryPrisma<Row>(
  delegate: PrismaDelegate<Row>,
  query: TableQuery,
  options: PrismaOptions & { extra?: Record<string, unknown> } = {},
): Promise<TablePage<Row>> {
  const args = toPrisma(query, options)
  const [rows, total] = await Promise.all([delegate.findMany({ ...options.extra, ...args }), delegate.count({ where: args.where })])
  return toTablePage(rows, total, query)
}

function condition(f: QueryFilter, mode: object, esc: (v: string) => string): unknown {
  const v = f.value as FilterValue
  switch (f.op) {
    case 'eq':
      return { equals: v }
    case 'ne':
      return { not: v }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
    case 'in':
    case 'notIn':
      return { [f.op]: f.value }
    case 'isNull':
      return null
    case 'isNotNull':
      return { not: null }
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return { [f.op]: esc(v as string), ...mode }
  }
}
