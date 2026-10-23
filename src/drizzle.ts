import { and, asc, count, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import type { Column, SQL, SQLWrapper, Table } from 'drizzle-orm'
import { likePattern, toTablePage, type QueryFilter, type TableQuery, type TablePage } from './core'

/** A Drizzle table, or a map of field name to column / SQL expression (for joins and computed columns). */
export type DrizzleSource = Table | Record<string, Column | SQL | SQL.Aliased>

export interface DrizzleQueryParts {
  /** `undefined` when there are no filters. */
  where: SQL | undefined
  orderBy: SQL[]
  limit: number
  offset: number
}

/**
 * Build Drizzle `where`, `orderBy`, `limit` and `offset` from a parsed table query.
 * Values are bound as parameters; column names only come from the allow-list.
 */
export function toDrizzle(query: TableQuery, source: DrizzleSource): DrizzleQueryParts {
  return {
    where: drizzleWhere(query, source),
    orderBy: query.sorting.map((s) => (s.desc ? desc : asc)(ref(source, s.field))),
    limit: query.pagination.limit,
    offset: query.pagination.offset,
  }
}

/** Only the WHERE clause, e.g. for a count query. */
export function drizzleWhere(query: TableQuery, source: DrizzleSource): SQL | undefined {
  const parts: SQL[] = query.filters.map((f) => condition(f, ref(source, f.field)))
  if (query.globalFilter) {
    const pattern = likePattern('contains', query.globalFilter.value)
    parts.push(or(...query.globalFilter.fields.map((field) => ilike(ref(source, field), pattern)))!)
  }
  return parts.length ? and(...parts) : undefined
}

/**
 * Run the page query and the count query on a table and return rows plus counts.
 * Works with any Drizzle driver whose `db.select()` is awaitable (Postgres, SQLite, MySQL...).
 */
export async function queryDrizzle<Row = Record<string, unknown>>(db: DrizzleDb, table: Table, query: TableQuery): Promise<TablePage<Row>> {
  const { where, orderBy, limit, offset } = toDrizzle(query, table)
  const [rows, total] = await Promise.all([
    db.select().from(table).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ value: count() }).from(table).where(where),
  ])
  return toTablePage(rows as Row[], Number(total[0]?.value ?? 0), query)
}

/** The part of a Drizzle database object `queryDrizzle` uses. */
export interface DrizzleDb {
  select(fields?: Record<string, unknown>): { from(table: Table): any }
}

function ref(source: DrizzleSource, field: string): Column | SQL | SQL.Aliased {
  const cols = isTable(source) ? (getTableColumns(source) as Record<string, Column>) : source
  const c = Object.prototype.hasOwnProperty.call(cols, field) ? cols[field] : undefined
  if (!c) throw new Error(`tanstack-table-server-query: field "${field}" is not a column of the Drizzle source`)
  return c
}

function isTable(s: DrizzleSource): s is Table {
  return typeof s === 'object' && s !== null && Symbol.for('drizzle:IsDrizzleTable') in s
}

// Case-insensitive LIKE that works on Postgres, SQLite and MySQL; `\` escapes `%` and `_`.
function ilike(col: SQLWrapper, pattern: string): SQL {
  return sql`lower(${col}) like lower(${pattern}) escape '\\'`
}

function condition(f: QueryFilter, col: Column | SQL | SQL.Aliased): SQL {
  const c = col as Column
  const v = f.value as never
  switch (f.op) {
    case 'eq':
      return eq(c, v)
    case 'ne':
      return ne(c, v)
    case 'lt':
      return lt(c, v)
    case 'lte':
      return lte(c, v)
    case 'gt':
      return gt(c, v)
    case 'gte':
      return gte(c, v)
    case 'in':
      return inArray(c, f.value as never[])
    case 'notIn':
      return notInArray(c, f.value as never[])
    case 'isNull':
      return isNull(c)
    case 'isNotNull':
      return isNotNull(c)
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return ilike(c, likePattern(f.op, f.value as string))
  }
}
