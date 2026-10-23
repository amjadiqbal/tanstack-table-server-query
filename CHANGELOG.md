# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-10-23

No code changes.

### Added (tests)

- The adapter suite also runs on the lowest supported peers, drizzle-orm 0.36.4 and kysely 0.27.6.
- `in` / `notIn` cases with commas, quotes, parentheses and backslashes in the values, for every adapter.
- A test that pins PostgREST's `*`-is-a-wildcard behaviour the README describes.

### Changed (docs)

- README: an Errors section listing every error message, its path, what `invalid: 'ignore'` caps or
  drops, how errors look through a Start `.validator()`, and which adapter calls throw. Tested
  versions are named exactly.

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
