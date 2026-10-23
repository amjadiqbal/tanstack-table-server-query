// Framework-free core: validate TanStack Table state against a column allow-list and
// turn it into a typed, database-neutral query description.

/** How a column's values are validated and which filter operators it allows. */
export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'enum'

export type FilterOp =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull'

/** Operators a client may send explicitly as `{ op, value }`. `between` is expanded to `gte` + `lte`. */
export type InputFilterOp = FilterOp | 'between'

export interface ColumnConfig {
  type: ColumnType
  /** Database column or field name. Defaults to the column id. */
  field?: string
  /** Default `true`. */
  sortable?: boolean
  /** Default `true`. */
  filterable?: boolean
  /** Operators this column accepts. Defaults depend on `type` (see README). */
  ops?: readonly InputFilterOp[]
  /** Operator for a plain value such as `f.customer=acme`. Default `contains` for strings, `eq` otherwise. */
  defaultOp?: FilterOp
  /** Allowed values for `type: 'enum'`. */
  values?: readonly string[]
}

export type ColumnsConfig = Record<string, ColumnConfig>

/** Search-param names, shared with `@amjadiqbal/tanstack-table-url-state`. */
export interface ParamKeys {
  sorting: string
  globalFilter: string
  page: string
  pageSize: string
  /** Each column filter is read from `<columnFilterPrefix><columnId>`. */
  columnFilterPrefix: string
}

export const DEFAULT_KEYS: ParamKeys = {
  sorting: 'sort',
  globalFilter: 'q',
  page: 'page',
  pageSize: 'size',
  columnFilterPrefix: 'f.',
}

export interface TableQueryOptions<C extends ColumnsConfig> {
  /** The column allow-list. Anything not listed here is rejected. */
  columns: C
  /** Sorting used when the request has none. */
  defaultSorting?: ReadonlyArray<{ id: Extract<keyof C, string>; desc?: boolean }>
  /**
   * Field appended to every ORDER BY (ascending) unless already sorted on, so pages are
   * stable when sort values tie. Usually the primary key, e.g. `'id'`.
   */
  tiebreaker?: string
  /** Columns the global filter searches (case-insensitive `contains`, OR-ed). String columns only. */
  globalFilter?: { columns: ReadonlyArray<Extract<keyof C, string>>; maxLength?: number }
  /** Default 10, like TanStack Table. */
  defaultPageSize?: number
  /** Larger page sizes are rejected (or capped with `invalid: 'ignore'`). Default 100. */
  maxPageSize?: number
  /** Highest 0-based page index accepted, which bounds OFFSET. Default 10000. */
  maxPageIndex?: number
  /** Most column filters per request. Default 20. */
  maxFilters?: number
  /** Most sort columns per request. Default 3. */
  maxSorts?: number
  /** Most values in an `in` / `notIn` list. Default 100. */
  maxListLength?: number
  /** Longest string filter value. Default 200. */
  maxStringLength?: number
  /**
   * `'throw'` (default): any unknown column, operator or bad value throws a {@link TableQueryError}.
   * `'ignore'`: the bad part is dropped and listed in `query.issues`; useful for hand-edited URLs.
   */
  invalid?: 'throw' | 'ignore'
  /** Prepended to every search-param name, e.g. `'orders.'`. */
  prefix?: string
  /** Override individual search-param names. */
  keys?: Partial<ParamKeys>
}

export type FilterValue = string | number | boolean | Date

export interface QueryFilter<Id extends string = string> {
  id: Id
  field: string
  type: ColumnType
  op: FilterOp
  /** `null` for `isNull` / `isNotNull`, an array for `in` / `notIn`. Dates are `Date` objects. */
  value: FilterValue | FilterValue[] | null
}

export interface QuerySort<Id extends string = string> {
  /** Column id, or the tiebreaker field. */
  id: Id | string
  field: string
  desc: boolean
}

export interface QueryIssue {
  path: Array<string | number>
  message: string
}

/** The validated, database-neutral query that adapters turn into ORM calls. */
export interface TableQuery<Id extends string = string> {
  sorting: QuerySort<Id>[]
  /** All filters are AND-ed. */
  filters: QueryFilter<Id>[]
  /** OR-ed case-insensitive `contains` over `fields`; `null` when there is no search. */
  globalFilter: { value: string; fields: string[] } | null
  pagination: { pageIndex: number; pageSize: number; offset: number; limit: number }
  /** Parts of the input that were dropped (only with `invalid: 'ignore'`). */
  issues: QueryIssue[]
}

/** TanStack Table state slices, as a client would send them in a request body. */
export interface TableStateInput {
  sorting?: ReadonlyArray<{ id: string; desc?: boolean }>
  columnFilters?: ReadonlyArray<{ id: string; value: unknown }>
  globalFilter?: unknown
  pagination?: { pageIndex?: number; pageSize?: number }
}

/**
 * What `parse()` accepts: table state (`{ sorting, columnFilters, globalFilter, pagination }`),
 * `URLSearchParams`, a query string, or a search object such as TanStack Router's `search`.
 */
export type TableQueryInput = TableStateInput | URLSearchParams | string | Record<string, unknown>

export class TableQueryError extends Error {
  readonly issues: QueryIssue[]
  /** HTTP status to answer with. */
  readonly status = 400
  constructor(issues: QueryIssue[]) {
    super(`Invalid table query: ${issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
    this.name = 'TableQueryError'
    this.issues = issues
  }
}

/** Minimal Standard Schema v1 interface (https://standardschema.dev). */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => { value: Output; issues?: undefined } | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
    readonly types?: { readonly input: Input; readonly output: Output }
  }
}

export interface TableQueryDefinition<C extends ColumnsConfig> extends StandardSchemaV1<TableQueryInput, TableQuery<Extract<keyof C, string>>> {
  readonly columns: C
  /** Validate input and build the query. Throws {@link TableQueryError} unless `invalid: 'ignore'`. */
  parse(input: TableQueryInput): TableQuery<Extract<keyof C, string>>
  safeParse(input: TableQueryInput): { success: true; data: TableQuery<Extract<keyof C, string>> } | { success: false; error: TableQueryError }
}

const TYPE_OPS: Record<ColumnType, readonly InputFilterOp[]> = {
  string: ['eq', 'ne', 'contains', 'startsWith', 'endsWith', 'in', 'notIn', 'isNull', 'isNotNull'],
  enum: ['eq', 'ne', 'in', 'notIn', 'isNull', 'isNotNull'],
  number: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between', 'in', 'notIn', 'isNull', 'isNotNull'],
  date: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between', 'isNull', 'isNotNull'],
  boolean: ['eq', 'ne', 'isNull', 'isNotNull'],
}

const ALL_OPS = new Set<string>([...TYPE_OPS.string, ...TYPE_OPS.number])

/** Define the allow-list once, then `parse()` each request with it. */
export function defineTableQuery<const C extends ColumnsConfig>(options: TableQueryOptions<C>): TableQueryDefinition<C> {
  const o = resolveOptions(options)
  type Q = TableQuery<Extract<keyof C, string>>
  const parse = (input: TableQueryInput) => build(o, input) as Q
  const safeParse = (input: TableQueryInput) => {
    try {
      return { success: true as const, data: parse(input) }
    } catch (e) {
      if (e instanceof TableQueryError) return { success: false as const, error: e }
      throw e
    }
  }
  return {
    columns: options.columns,
    parse,
    safeParse,
    '~standard': {
      version: 1,
      vendor: 'tanstack-table-server-query',
      validate: (value) => {
        const r = safeParse(value as TableQueryInput)
        return r.success ? { value: r.data } : { issues: r.error.issues }
      },
    },
  }
}

/** Rows plus the counts a manually paginated table needs (`rowCount`, `pageCount`). */
export interface TablePage<Row> {
  rows: Row[]
  rowCount: number
  pageCount: number
  pageIndex: number
  pageSize: number
}

export function toTablePage<Row>(rows: Row[], rowCount: number, query: Pick<TableQuery, 'pagination'>): TablePage<Row> {
  const { pageIndex, pageSize } = query.pagination
  return { rows, rowCount, pageCount: Math.ceil(rowCount / pageSize), pageIndex, pageSize }
}

/** Escape `%`, `_` and `\` for a LIKE pattern that uses `ESCAPE '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c)
}

/** The LIKE pattern for a `contains` / `startsWith` / `endsWith` filter. */
export function likePattern(op: 'contains' | 'startsWith' | 'endsWith', value: string): string {
  const v = escapeLike(value)
  return op === 'contains' ? `%${v}%` : op === 'startsWith' ? `${v}%` : `%${v}`
}

// ---- internals ------------------------------------------------------------

interface ResolvedColumn {
  id: string
  field: string
  type: ColumnType
  sortable: boolean
  filterable: boolean
  ops: ReadonlySet<InputFilterOp>
  defaultOp: FilterOp
  values?: ReadonlySet<string>
}

interface Resolved {
  columns: Map<string, ResolvedColumn>
  defaultSorting: QuerySort[]
  tiebreaker?: string
  globalFields: string[]
  globalMax: number
  defaultPageSize: number
  maxPageSize: number
  maxPageIndex: number
  maxFilters: number
  maxSorts: number
  maxList: number
  maxString: number
  ignore: boolean
  keys: ParamKeys
}

function resolveOptions<C extends ColumnsConfig>(options: TableQueryOptions<C>): Resolved {
  const columns = new Map<string, ResolvedColumn>()
  for (const [id, c] of Object.entries(options.columns)) {
    if (!TYPE_OPS[c.type]) throw new Error(`Column "${id}": unknown type "${c.type}"`)
    if (c.type === 'enum' && !c.values?.length) throw new Error(`Column "${id}": enum columns need \`values\``)
    const ops = c.ops ?? TYPE_OPS[c.type]
    for (const op of ops) {
      if (!ALL_OPS.has(op)) throw new Error(`Column "${id}": unknown operator "${op}"`)
      if (!TYPE_OPS[c.type].includes(op)) throw new Error(`Column "${id}": operator "${op}" does not apply to ${c.type} columns`)
    }
    const defaultOp = c.defaultOp ?? (c.type === 'string' ? 'contains' : 'eq')
    columns.set(id, {
      id,
      field: c.field ?? id,
      type: c.type,
      sortable: c.sortable ?? true,
      filterable: c.filterable ?? true,
      ops: new Set(ops),
      defaultOp,
      values: c.values ? new Set(c.values) : undefined,
    })
  }
  const globalFields = (options.globalFilter?.columns ?? []).map((id) => {
    const col = columns.get(id)
    if (!col) throw new Error(`globalFilter: unknown column "${id}"`)
    if (col.type !== 'string') throw new Error(`globalFilter: column "${id}" is not a string column`)
    return col.field
  })
  const defaultSorting = (options.defaultSorting ?? []).map((s) => {
    const col = columns.get(s.id)
    if (!col) throw new Error(`defaultSorting: unknown column "${s.id}"`)
    return { id: s.id, field: col.field, desc: !!s.desc }
  })
  const prefix = options.prefix ?? ''
  const keys = Object.fromEntries(Object.entries({ ...DEFAULT_KEYS, ...options.keys }).map(([k, v]) => [k, prefix + v])) as unknown as ParamKeys
  return {
    columns,
    defaultSorting,
    tiebreaker: options.tiebreaker,
    globalFields,
    globalMax: options.globalFilter?.maxLength ?? 200,
    defaultPageSize: options.defaultPageSize ?? 10,
    maxPageSize: options.maxPageSize ?? 100,
    maxPageIndex: options.maxPageIndex ?? 10_000,
    maxFilters: options.maxFilters ?? 20,
    maxSorts: options.maxSorts ?? 3,
    maxList: options.maxListLength ?? 100,
    maxString: options.maxStringLength ?? 200,
    ignore: options.invalid === 'ignore',
    keys,
  }
}

const STATE_KEYS = ['sorting', 'columnFilters', 'globalFilter', 'pagination']

/** Bring every accepted input shape to table state. */
function toState(input: TableQueryInput, keys: ParamKeys, issue: (path: Array<string | number>, msg: string) => void): TableStateInput {
  if (input == null) return {}
  if (typeof input === 'string' || input instanceof URLSearchParams) {
    const params = typeof input === 'string' ? new URLSearchParams(input) : input
    const rec: Record<string, unknown> = {}
    for (const [k, v] of params) rec[k] = v
    return paramsToState(rec, keys, issue)
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    issue([], 'expected table state, URLSearchParams, a query string or a search object')
    return {}
  }
  if (STATE_KEYS.some((k) => k in input)) return input as TableStateInput
  return paramsToState(input as Record<string, unknown>, keys, issue)
}

function paramsToState(rec: Record<string, unknown>, keys: ParamKeys, issue: (path: Array<string | number>, msg: string) => void): TableStateInput {
  const state: TableStateInput = {}
  const sort = rec[keys.sorting]
  if (sort !== undefined && sort !== '') {
    if (typeof sort !== 'string') issue([keys.sorting], 'expected a string such as "-total,customer"')
    else
      state.sorting = sort
        .split(',')
        .filter(Boolean)
        .map((part) => (part.startsWith('-') ? { id: unescId(part.slice(1)), desc: true } : { id: unescId(part), desc: false }))
  }
  const q = rec[keys.globalFilter]
  if (q !== undefined) state.globalFilter = typeof q === 'string' ? decodeValue(q) : q
  const page = rec[keys.page]
  const size = rec[keys.pageSize]
  if (page !== undefined || size !== undefined) {
    state.pagination = {}
    if (page !== undefined) {
      const n = toInt(page)
      if (n === undefined || n < 1) issue([keys.page], 'expected a whole number >= 1')
      else state.pagination.pageIndex = n - 1
    }
    if (size !== undefined) state.pagination.pageSize = toInt(size) ?? NaN
  }
  const filters: Array<{ id: string; value: unknown }> = []
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith(keys.columnFilterPrefix) && k.length > keys.columnFilterPrefix.length)
      filters.push({ id: k.slice(keys.columnFilterPrefix.length), value: typeof v === 'string' ? decodeValue(v) : v })
  }
  if (filters.length) state.columnFilters = filters
  return state
}

/** Same rules as tanstack-table-url-state: plain strings stay strings, JSON-looking ones are parsed. */
function decodeValue(raw: string): unknown {
  if (raw === '') return raw
  const c = raw[0]
  const json = c === '"' || c === '[' || c === '{' || raw === 'true' || raw === 'false' || raw === 'null' || /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)
  if (!json) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const unescId = (id: string) => id.replace(/%2C/gi, ',').replace(/%25/g, '%')

function toInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN
  return Number.isSafeInteger(n) ? n : undefined
}

function build(o: Resolved, input: TableQueryInput): TableQuery {
  const issues: QueryIssue[] = []
  const issue = (path: Array<string | number>, message: string) => issues.push({ path, message })
  const state = toState(input, o.keys, issue)

  // sorting
  const sorting: QuerySort[] = []
  const rawSort = state.sorting
  if (rawSort !== undefined && !Array.isArray(rawSort)) issue(['sorting'], 'expected an array')
  else if (rawSort) {
    if (rawSort.length > o.maxSorts) issue(['sorting'], `at most ${o.maxSorts} sort columns`)
    const seen = new Set<string>()
    rawSort.slice(0, o.maxSorts).forEach((s, i) => {
      const id = s && typeof s === 'object' ? (s as { id?: unknown }).id : undefined
      const col = typeof id === 'string' ? o.columns.get(id) : undefined
      if (!col) return issue(['sorting', i], `unknown column ${JSON.stringify(id)}`)
      if (!col.sortable) return issue(['sorting', i], `column "${col.id}" is not sortable`)
      if (seen.has(col.id)) return
      seen.add(col.id)
      sorting.push({ id: col.id, field: col.field, desc: (s as { desc?: unknown }).desc === true })
    })
  }
  if (!sorting.length) sorting.push(...o.defaultSorting)
  if (o.tiebreaker && !sorting.some((s) => s.field === o.tiebreaker)) sorting.push({ id: o.tiebreaker, field: o.tiebreaker, desc: false })

  // column filters
  const filters: QueryFilter[] = []
  const rawFilters = state.columnFilters
  if (rawFilters !== undefined && !Array.isArray(rawFilters)) issue(['columnFilters'], 'expected an array')
  else if (rawFilters) {
    if (rawFilters.length > o.maxFilters) issue(['columnFilters'], `at most ${o.maxFilters} filters`)
    rawFilters.slice(0, o.maxFilters).forEach((f, i) => {
      const id = f && typeof f === 'object' ? (f as { id?: unknown }).id : undefined
      const col = typeof id === 'string' ? o.columns.get(id) : undefined
      if (!col) return issue(['columnFilters', i], `unknown column ${JSON.stringify(id)}`)
      if (!col.filterable) return issue(['columnFilters', i], `column "${col.id}" is not filterable`)
      const err = filterFor(o, col, (f as { value?: unknown }).value, filters)
      if (err) issue(['columnFilters', i], `column "${col.id}": ${err}`)
    })
  }

  // global filter
  let globalFilter: TableQuery['globalFilter'] = null
  const g = state.globalFilter
  if (g !== undefined && g !== null && g !== '') {
    if (typeof g !== 'string' && typeof g !== 'number') issue(['globalFilter'], 'expected a string')
    else if (!o.globalFields.length) issue(['globalFilter'], 'global filter is not enabled for this table')
    else {
      const v = String(g).trim()
      if (v.length > o.globalMax) issue(['globalFilter'], `longer than ${o.globalMax} characters`)
      else if (v) globalFilter = { value: v, fields: o.globalFields }
    }
  }

  // pagination
  let pageIndex = 0
  let pageSize = o.defaultPageSize
  const p = state.pagination
  if (p !== undefined && (typeof p !== 'object' || p === null)) issue(['pagination'], 'expected { pageIndex, pageSize }')
  else if (p) {
    if (p.pageIndex !== undefined) {
      if (!Number.isSafeInteger(p.pageIndex) || p.pageIndex < 0) issue(['pagination', 'pageIndex'], 'expected a whole number >= 0')
      else if (p.pageIndex > o.maxPageIndex) {
        issue(['pagination', 'pageIndex'], `at most ${o.maxPageIndex}`)
        pageIndex = o.maxPageIndex
      } else pageIndex = p.pageIndex
    }
    if (p.pageSize !== undefined) {
      if (!Number.isSafeInteger(p.pageSize) || p.pageSize < 1) issue(['pagination', 'pageSize'], 'expected a whole number >= 1')
      else if (p.pageSize > o.maxPageSize) {
        issue(['pagination', 'pageSize'], `at most ${o.maxPageSize}`)
        pageSize = o.maxPageSize
      } else pageSize = p.pageSize
    }
  }

  if (issues.length && !o.ignore) throw new TableQueryError(issues)
  return {
    sorting,
    filters,
    globalFilter,
    pagination: { pageIndex, pageSize, offset: pageIndex * pageSize, limit: pageSize },
    issues,
  }
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.every(isBlank))
}

/** Validate one filter and push its normalised form(s). Returns an error message, or undefined. */
function filterFor(o: Resolved, col: ResolvedColumn, raw: unknown, out: QueryFilter[]): string | undefined {
  let op: InputFilterOp
  let value: unknown
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !(raw instanceof Date)) {
    const r = raw as { op?: unknown; value?: unknown }
    if (typeof r.op !== 'string' || !ALL_OPS.has(r.op)) return `unknown operator ${JSON.stringify(r.op)}`
    op = r.op as InputFilterOp
    value = r.value
  } else {
    if (isBlank(raw)) return // TanStack Table drops empty filters too
    value = raw
    if (Array.isArray(raw)) op = col.type === 'number' || col.type === 'date' ? 'between' : 'in'
    else op = col.defaultOp
  }
  if (!col.ops.has(op)) return `operator "${op}" is not allowed`
  const push = (fop: FilterOp, v: QueryFilter['value']) => out.push({ id: col.id, field: col.field, type: col.type, op: fop, value: v })

  if (op === 'isNull' || op === 'isNotNull') return void push(op, null)

  if (op === 'in' || op === 'notIn') {
    if (!Array.isArray(value)) return `"${op}" needs an array`
    if (!value.length) return `"${op}" needs at least one value`
    if (value.length > o.maxList) return `at most ${o.maxList} values`
    const vals: FilterValue[] = []
    for (const v of value) {
      const c = coerce(o, col, v)
      if (c instanceof Bad) return c.message
      vals.push(c)
    }
    return void push(op, vals)
  }

  if (op === 'between') {
    if (!Array.isArray(value) || value.length !== 2) return '"between" needs [min, max]'
    const ends = value.map((v) => (isBlank(v) ? undefined : { raw: v, val: coerce(o, col, v) }))
    for (const e of ends) if (e?.val instanceof Bad) return e.val.message
    let [lo, hi] = ends as Array<{ raw: unknown; val: FilterValue } | undefined>
    if (!lo && !hi) return
    // Like Table's inNumberRange / inDateRange: blank ends are open, reversed ends are swapped.
    if (lo && hi && +(lo.val as number | Date) > +(hi.val as number | Date)) [lo, hi] = [hi, lo]
    if (lo) push('gte', lo.val)
    // A date-only upper bound includes that whole day: `< next day`.
    if (hi && col.type === 'date' && isDateOnly(hi.raw)) push('lt', addDay(hi.val as Date))
    else if (hi) push('lte', hi.val)
    return
  }

  if (isBlank(value)) return `"${op}" needs a value`
  const c = coerce(o, col, value)
  if (c instanceof Bad) return c.message
  if ((op === 'contains' || op === 'startsWith' || op === 'endsWith') && typeof c !== 'string') return `"${op}" needs a string`
  // `eq` on a date-only value matches that whole day.
  if (col.type === 'date' && isDateOnly(value) && (op === 'eq' || op === 'ne')) {
    if (op === 'ne') return 'use "lt"/"gte" or a datetime with "ne"'
    push('gte', c as Date)
    return void push('lt', addDay(c as Date))
  }
  if (col.type === 'date' && isDateOnly(value) && op === 'lte') return void push('lt', addDay(c as Date))
  if (col.type === 'date' && isDateOnly(value) && op === 'gt') return void push('gte', addDay(c as Date))
  push(op, c as FilterValue)
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const isDateOnly = (v: unknown) => typeof v === 'string' && DATE_ONLY.test(v)
const addDay = (d: Date) => new Date(d.getTime() + 86_400_000)

class Bad {
  constructor(readonly message: string) {}
}

/** Coerce one value to the column's type. */
function coerce(o: Resolved, col: ResolvedColumn, v: unknown): FilterValue | Bad {
  switch (col.type) {
    case 'string': {
      if (typeof v !== 'string' && typeof v !== 'number') return new Bad('expected a string')
      const s = String(v)
      return s.length > o.maxString ? new Bad(`longer than ${o.maxString} characters`) : s
    }
    case 'enum':
      return typeof v === 'string' && col.values!.has(v) ? v : new Bad(`${JSON.stringify(v)} is not one of the allowed values`)
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
      return Number.isFinite(n) ? n : new Bad('expected a number')
    }
    case 'boolean':
      return v === true || v === 'true' ? true : v === false || v === 'false' ? false : new Bad('expected true or false')
    case 'date': {
      // Date-only strings are UTC midnight.
      const d =
        typeof v === 'string' && v.length <= 40
          ? new Date(isDateOnly(v) ? v + 'T00:00:00Z' : v)
          : typeof v === 'number'
            ? new Date(v)
            : v instanceof Date
              ? new Date(v)
              : null
      return d && !Number.isNaN(d.getTime()) ? d : new Bad('expected a date (ISO string or timestamp)')
    }
  }
}
