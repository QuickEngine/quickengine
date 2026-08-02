# QuickDash Shop

**The dogfood.** QuickEngine's own merch store — mugs, stickers, shirts — running entirely on
QuickDash.

Not a demo, a mock, or a seeded sandbox. A real shop that takes real orders, powered by the same
modules a customer gets: Products & Services for the catalog, Inventory for stock, Orders,
Payments, Shipping and Fulfillment for everything after checkout.

## Why it exists

Proof of work. "You can run an e-commerce shop on QuickDash" is a claim; a shop you can actually
buy a mug from is evidence. It is the one thing on the marketing site that cannot be faked, and
the fastest way to find out whether the commerce workflow is genuinely good — because we are the
customer.

It also means every commerce bug hits us before it hits anyone paying.

## The showcase sidebar

**The idea that makes this more than a store.** The shop runs on a real, dedicated QuickDash
workspace. When someone buys a mug, a sidebar shows **their own order moving through the
modules** — client record created, order placed, payment captured, fulfillment opened, shipment
tracked — live, as it happens.

Nobody believes a feature list. Everybody believes watching the thing they just paid for travel
down the chain.

It is a shop and a demo at once, and the demo cannot be faked, because it is their order.

### 🔴 The constraint that decides the design

**A buyer must see their own order and nothing else.** If the sidebar renders the workspace's
activity feed, buyer B watches buyer A's name and shipping address scroll past. That is not a
polish problem; it is the thing that would kill the feature and the trust with it.

### What it needs

The backend is close but not there:

- `POST /v1/realtime/auth` and `GET /v1/activity` both require **workspace authorization**, so a
  buyer cannot subscribe to anything today.
- There is no publishable read on orders.

**The missing piece is a per-order token**, and the pattern already exists and is proven:
`/v1/quickdash/sign/:token` for contract signing, where the recipient has no session and the
token IS the authorization. The same shape gives a buyer a link that shows one order's timeline
and can show nothing else.

Roughly: issue a token at checkout, `GET /v1/orders/track/:token` returns that order's status and
its events, realtime scoped to that aggregate id.

### Naming

Asher wants something with "Quick" in it. Undecided.

## What it is not

- Not a template customers install. It is our store, on our workspace.
- Not part of QuickDash's product surface. Buyers here have no QuickDash account and never
  see the dashboard.

## Status

Nothing built. Directory reserved so the intent is not lost again.

## What already supports it

The backend is there. Worth knowing before scoping:

- **Catalog** has a published/storefront read reachable with a **publishable key**, which is
  what a public storefront authenticates with — no secret key in a browser.
- **`POST /v1/events`** ingests storefront traffic with that same publishable key, so the shop
  gets its own analytics through the reporting module.
- **Orders → Payments → Fulfillment → Shipping** are wired end to end and covered by integration
  tests.

## Open questions, when it is scoped

- Its own Vite app under `apps/quickdash/shop`, or a route on the marketing site?
- Which host — `shop.quickdash.xyz`, or on `quickengine.xyz`?
- Print-on-demand for fulfillment, or hold stock?
- Buyer accounts at all, or guest checkout only?

Ordered after Docs and Help in `internal/planning/FRONTEND_ROADMAP.md`.
