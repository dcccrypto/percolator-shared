# @percolator/shared

Shared utilities for Percolator backend services (API, Indexer, Keeper).

## What's inside

- **Config** — environment loading, validation
- **Database** — Supabase client helpers, query builders
- **Logger** — structured logging with context
- **Monitor** — service health monitoring with alerts
- **Retry** — exponential backoff with jitter
- **Sanitize** — input sanitization
- **Sentry** — error tracking integration
- **Alerts** — alert routing (Discord, etc.)
- **Validation** — Zod schemas for API/config validation
- **Network validation** — RPC endpoint health checks

## Install

```bash
pnpm add @percolator/shared
```

## Build

```bash
pnpm build
```

## Test

```bash
pnpm test
```

## License

Apache-2.0
