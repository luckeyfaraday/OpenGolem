# Vendored pi-coding-agent

OpenGolem now depends on a local vendored package at:

- `packages/pi-coding-agent`

The root dependency is pinned via:

- `@mariozechner/pi-coding-agent: file:packages/pi-coding-agent`

## Why

- avoids critical runtime changes living only in `node_modules`
- makes engine-level diffs reviewable in this repo
- prevents `npm ci` from discarding OpenGolem-specific pi changes

## Current limitation

The package now includes:

- published `dist/**`
- reconstructed `src/**` extracted from source maps
- local build scaffolding for rebuilding `dist` from `src`

This is still derived from the published package rather than a clean upstream git fork, but it is now source-bearing and practical for TypeScript-level engine changes inside this repo.

## Updating the vendored snapshot

1. Refresh `packages/pi-coding-agent` from the desired pi package version.
2. Run `node scripts/extract-vendored-pi-source.mjs`.
3. Keep the dependency as `file:packages/pi-coding-agent`.
4. Run `npm install`.
5. Rebuild vendored pi with `npm run build:pi-vendored` when needed.
6. Re-run `npx tsc -p tsconfig.json --noEmit` and the relevant test suite.
