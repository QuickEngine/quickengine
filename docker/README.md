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

Keep this file small. Add new services only when the codebase actually needs them.
