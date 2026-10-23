# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-23

### Added

- `defineTableQuery()`: a column allow-list (`string`, `enum`, `number`, `date`, `boolean`, with
  per-column operators, `field` mapping, `sortable` / `filterable`) that validates TanStack Table v9
  state from a request body, `URLSearchParams`, a query string or a TanStack Router search object,
  and returns a database-neutral query. `parse()`, `safeParse()`, `TableQueryError` (status 400,
  issues with paths), `invalid: 'ignore'`, limits on page size, page index, filters, sorts, list
  and string length, `defaultSorting`, `tiebreaker`, global filter columns. Implements Standard
  Schema v1, so it works as a TanStack Start server function validator (`.validator()`). Reads the URL format of
  `@amjadiqbal/tanstack-table-url-state`.
- `/drizzle`: `toDrizzle()`, `drizzleWhere()`, `queryDrizzle()`.
- `/prisma`: `toPrisma()`, `prismaWhere()`, `queryPrisma()`; escapes LIKE wildcards Prisma leaves raw.
- `/kysely`: `applyKysely()`, `applyKyselyWhere()`, `kyselyWhere()`, `queryKysely()`.
- `/supabase`: `applySupabase()`, `applySupabaseFilters()`, `querySupabase()`; quotes values in
  `or()` / `not.in` lists and handles PostgREST's 416 for a page past the end.
