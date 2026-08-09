# @quickengine/cli

`quick` — the QuickEngine command-line tool. It's the ecosystem-level CLI (a peer of the
`@quickengine/quick` SDK): you configure a workspace-scoped API key once, then read product
APIs (QuickDash today) from your terminal.

> **Status:** real, not stubbed. Commands follow the deployed `/v1` API and cover activity,
> bookings, catalog, clients, contracts, files, fulfillment, inventory, invoices, orders,
> payments, projects, quotes, reports, shipments, time tracking and webhooks. Workspace, module
> and key management remain in Account because their APIs are session-only.

## Setup

Point it at a product API origin and a workspace, with a key from **Account → your
workspace → API keys**:

```bash
quick config set \
  --base-url https://api.quickdash.xyz \
  --workspace <workspace-id> \
  --key qsk_...            # qpk_ (publishable), qsk_ (secret), or qsc_ (scoped)
```

Config is stored at `~/.quick/config.json` (owner-only perms). Environment variables win
over the file, so CI needs no written config:

```bash
export QUICK_BASE_URL=https://api.quickdash.xyz
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
quick init                        # guided, verified setup
quick create app <name>           # minimal framework-independent connected project
```

`quick doctor` is the first thing to run — it checks your settings, validates the key
format, and makes a real read to confirm the API is reachable and the key works,
translating failures into plain language (bad key, module disabled, wrong workspace).

Every command takes `--json` where it prints data, so the CLI composes in scripts.

Run `quick --help` for the complete resource command list. `quick create app` intentionally
generates one readable server script rather than choosing a frontend framework for you; the
multi-framework wizard follows the Connect UX design later.

## What's next

The command surface grows with the API. Workspace, module and key management arrive when their
management contracts are suitable for non-browser credentials. See the public API documentation
for the authoritative HTTP contract.
