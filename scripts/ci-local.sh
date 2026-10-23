#!/usr/bin/env bash
# Local CI. GitHub workflows never run for this repo; paste this script's summary into the PR.
# Needs Docker: the adapter tests run against real Postgres 17 and PostgREST 13 containers.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n== %s ==\n' "$1"; }

step "install";   npm ci
step "databases"; docker compose -f test/docker-compose.yml up -d --wait
step "prisma";    npx --no-install prisma generate --schema test/prisma/schema.prisma
step "typecheck"; npm run typecheck
step "lint";      npm run lint
step "test";      npm test
step "build";     npm run build
step "publint";   npx --no-install publint
step "pack";      npm pack --dry-run

printf '\nci-local: all steps passed (stop the databases with: docker compose -f test/docker-compose.yml down)\n'
