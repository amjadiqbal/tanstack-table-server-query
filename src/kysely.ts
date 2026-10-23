import { sql } from 'kysely'
import type { Expression, ExpressionBuilder, Kysely, SelectQueryBuilder, SqlBool } from 'kysely'
import { likePattern, toTablePage, type QueryFilter, type TableQuery, type TablePage } from './core'

/**
 * Add the WHERE, ORDER BY, LIMIT and OFFSET of a parsed table query to a Kysely select.
 * Fields may be qualified (`'o.total'`) when the column config's `field` says so.
 */
export function applyKysely<QB extends SelectQueryBuilder<any, any, any>>(qb: QB, query: TableQuery): QB {
  let q = applyKyselyWhere(qb, query) as SelectQueryBuilder<any, any, any>
  for (const s of query.sorting) q = q.orderBy(sql.ref(s.field), s.desc ? 'desc' : 'asc')
  return q.limit(query.pagination.limit).offset(query.pagination.offset) as QB
}

/** Only the WHERE clause, e.g. for a count query. */
export function applyKyselyWhere<QB extends SelectQueryBuilder<any, any, any>>(qb: QB, query: TableQuery): QB {
  if (!query.filters.length && !query.globalFilter) return qb
  return (qb as SelectQueryBuilder<any, any, any>).where((eb) => kyselyWhere(eb, query)) as QB
}

/** The filters as one Kysely expression. */
export function kyselyWhere(eb: ExpressionBuilder<any, any>, query: TableQuery): Expression<SqlBool> {
  const parts: Expression<SqlBool>[] = query.filters.map((f) => condition(eb, f))
  if (query.globalFilter) {
    const pattern = likePattern('contains', query.globalFilter.value)
    parts.push(eb.or(query.globalFilter.fields.map((field) => ilike(field, pattern))))
  }
  return eb.and(parts)
}

/** Select all columns of `table` with the query applied, plus a count with the same WHERE. */
export async function queryKysely<Row = Record<string, unknown>>(db: Kysely<any>, table: string, query: TableQuery): Promise<TablePage<Row>> {
  const [rows, total] = await Promise.all([
    applyKysely(db.selectFrom(table).selectAll(), query).execute(),
    applyKyselyWhere(db.selectFrom(table).select((eb) => eb.fn.countAll().as('count')), query).executeTakeFirst(),
  ])
  return toTablePage(rows as Row[], Number((total as { count?: unknown } | undefined)?.count ?? 0), query)
}

// Case-insensitive LIKE that works on Postgres, SQLite and MySQL; `\` escapes `%` and `_`.
function ilike(field: string, pattern: string): Expression<SqlBool> {
  return sql<SqlBool>`lower(${sql.ref(field)}) like lower(${pattern}) escape '\\'`
}

function condition(eb: ExpressionBuilder<any, any>, f: QueryFilter): Expression<SqlBool> {
  const col = sql.ref(f.field)
  const v = f.value as any
  switch (f.op) {
    case 'eq':
      return eb(col, '=', v)
    case 'ne':
      return eb(col, '<>', v)
    case 'lt':
      return eb(col, '<', v)
    case 'lte':
      return eb(col, '<=', v)
    case 'gt':
      return eb(col, '>', v)
    case 'gte':
      return eb(col, '>=', v)
    case 'in':
      return eb(col, 'in', v)
    case 'notIn':
      return eb(col, 'not in', v)
    case 'isNull':
      return eb(col, 'is', null)
    case 'isNotNull':
      return eb(col, 'is not', null)
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return ilike(f.field, likePattern(f.op, v))
  }
}
