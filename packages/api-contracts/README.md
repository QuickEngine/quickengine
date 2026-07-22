# QuickEngine API contracts

Runtime-neutral contracts shared by Hono, Quick.js, the CLI, tests, agents, jobs, and
future native clients. This package owns transport shapes, not module business behavior.

## Conventions

- Success: `{ data, meta: { requestId } }`.
- Failure: `{ error: { code, message, requestId, details? } }`.
- Correlation: `X-Request-Id` is accepted with a 128-character ceiling and echoed.
- Workspace scope: `QuickEngine-Workspace` for session requests; an API key remains bound
  to its own workspace and cannot be overridden.
- Credentials: secret/scoped keys use `Authorization: Bearer`; publishable keys use
  `QuickEngine-Publishable-Key`. The channels are not interchangeable.
- Pagination: cursor-based, default 25, maximum 100, with `nextCursor` and `hasMore`.
- Sorting: explicit field plus `asc`/`desc`; each resource must restrict allowed fields.
- Filtering: each resource declares typed filter fields rather than accepting arbitrary SQL-
  shaped expressions.
- OpenAPI: Zod schemas convert to JSON Schema 2020-12, which OpenAPI 3.1 consumes directly.
- Errors: codes are stable programmatic identifiers; messages may improve without becoming
  client control flow.

Module slices extend these primitives with their request, response, action, and event
schemas. They do not duplicate envelopes or invent route-local error formats.
