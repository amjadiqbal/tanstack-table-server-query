#!/usr/bin/env bash
# Local CI. GitHub workflows never run for this repo; paste this script's summary into the PR.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n== %s ==\n' "$1"; }

step "install";   npm ci
step "typecheck"; npm run typecheck
step "lint";      npm run lint
step "test";      npm test
step "build";     npm run build
step "publint";   npx --no-install publint
step "pack";      npm pack --dry-run

printf '\nci-local: all steps passed\n'
