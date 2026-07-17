# Local Services

QuickEngine local development starts shared infrastructure through Docker.

```sh
pnpm docker:up
pnpm docker:down
pnpm docker:reset
```

## Services

```txt
PostgreSQL  localhost:5435
Redis       localhost:6381
```

The root `.env.example` is configured for these ports.

Before any local schema command, verify `.env.local` points at this PostgreSQL instance
instead of the production Neon database. Docker resets are local-only; production data
changes require an explicit, reviewed migration or maintenance operation.

Keep this file small. Add new services only when the codebase actually needs them.
