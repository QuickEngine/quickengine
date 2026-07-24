# @quickengine/cli

`quick` — the QuickEngine command-line tool. It's the ecosystem-level CLI (a peer of the
`@quickengine/quick` SDK): you configure a workspace-scoped API key once, then read product
APIs (QuickDash today) from your terminal.

> **Status:** thin first tier, real not stubbed. It only exposes commands backed by real
> `/api/v1` routes — today that's catalog reads plus config/doctor. Workspace, module, and
> key *management* commands arrive when their management APIs do (they're session-only in
> Account for now, so shipping them here would mean stubbing — which we don't).

## Setup

Point it at a product API origin and a workspace, with a key from **Account → your
workspace → API keys**:

```bash
quick config set \
  --base-url https://dash.quickengine.xyz/api \
  --workspace <workspace-id> \
  --key qsk_...            # qpk_ (publishable), qsk_ (secret), or qsc_ (scoped)
```

Config is stored at `~/.quick/config.json` (owner-only perms). Environment variables win
over the file, so CI needs no written config:

```bash
export QUICK_BASE_URL=https://dash.quickengine.xyz/api
export QUICK_WORKSPACE=<workspace-id>
export QUICK_KEY=qsk_...
```

## Commands

```bash
quick config set [--base-url <url>] [--workspace <id>] [--key <key>]
quick config show [--json]        # key is masked

quick catalog list [--json]       # active catalog items
quick catalog get <id> [--json]   # one item with its active variants

quick doctor                      # verify config + key format + API connectivity
```

`quick doctor` is the first thing to run — it checks your settings, validates the key
format, and makes a real read to confirm the API is reachable and the key works,
translating failures into plain language (bad key, module disabled, wrong workspace).

Every command takes `--json` where it prints data, so the CLI composes in scripts.

## What's next

The command surface grows with the API: `quick events`, then `quick workspace` / `quick
module` / `quick keys` once their management routes exist, then the heavier `quick init` /
`dev` / `deploy` tier. See `internal/product/QUICK_JS.md` and `internal/planning/BACKLOG.md`.
