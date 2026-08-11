import { createFileRoute, notFound } from "@tanstack/react-router";
import { ICE } from "@/components/pill";
import { TextPage, TextSection, textProse } from "@/components/text-page";
import { CARD } from "@/lib/surfaces";

/**
 * The four developer sections.
 *
 * 🔴 EVERY FACT AND SAMPLE HERE IS READ FROM THE CODEBASE, not written from
 * memory of what the API probably looks like:
 *
 * - credential types → `packages/sdk/src/types.ts`
 * - the `{ data, requestId }` envelope → `packages/sdk/src/client.ts`
 * - rate limits and failure modes → `services/api/src/rate-limit.ts`
 * - constructors and samples → `packages/sdk/README.md`
 *
 * The version before this invented `new QuickEngine(...)` from a package called
 * `@quickengine/sdk`. Neither exists. Somebody pasting that gets an error
 * matching nothing on the internet and concludes we are broken.
 *
 * ⚠️ These four pages are deliberately DIFFERENT IN SHAPE, not four versions of
 * one template. Quickstarts is a sequence, API is a contract, SDKs is a
 * reference, CLI is a short honest note. An earlier draft gave all four the same
 * three blocks and they read as filler.
 */

const API_BASE = "https://api.quickdash.xyz";

function Snippet({ children }: { children: string }) {
	return (
		<pre
			style={{ backgroundColor: CARD }}
			className="mt-5 overflow-x-auto rounded-xl border border-white/[0.07] p-5 font-mono text-[0.8125rem] text-white/75 leading-[1.7]"
		>
			<code>{children}</code>
		</pre>
	);
}

/** A labelled row. Used for the credential and limit tables. */
function Row({ term, children }: { term: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1 border-white/[0.07] border-b py-4 first:pt-0 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-6">
			<span
				style={{ color: ICE }}
				className="shrink-0 font-mono text-[0.8125rem] sm:w-44"
			>
				{term}
			</span>
			<span className="font-body font-light text-[0.9375rem] text-white/60 leading-[1.6]">
				{children}
			</span>
		</div>
	);
}

type Section = { title: string; lede: string; body: React.ReactNode };

const SECTIONS: Record<string, Section> = {
	// ── A sequence. Three real scenarios, in order of how common they are. ────
	quickstarts: {
		title: "Three ways in.",
		lede: "Pick the one that matches what you are building. Each is complete, and none of them asks you to move your site.",
		body: (
			<>
				<TextSection title="A site that publishes words">
					<div className={textProse}>
						<p>
							A portfolio, an agency site, a brochure. Your developer declares
							the slots; you edit the words in QuickDash and the site reads
							them.
						</p>
					</div>
					<Snippet>{`import { createQuickConnect } from "@quickengine/quick/browser";

const quick = createQuickConnect({
  baseUrl: "${API_BASE}",
  workspaceId: import.meta.env.VITE_QUICK_WORKSPACE_ID,
  credential: { type: "site", key: import.meta.env.VITE_QUICK_SITE_KEY },
});

// A flat map, keyed by slot: content["about.body"]
const { data: content } = await quick.site.content();`}</Snippet>
					<div className={textProse}>
						<p>
							Keep a local default for every slot. The page is then correct
							before it is connected, and stale rather than blank if the API is
							unreachable.
						</p>
					</div>
				</TextSection>

				<TextSection title="A storefront that sells">
					<div className={textProse}>
						<p>
							Read the catalog, then hand the basket to checkout. You never send
							a price: the server resolves every one from its own catalog, which
							is what makes a public key safe to ship.
						</p>
					</div>
					<Snippet>{`const { data: items } = await quick.catalog.list();
const { data: product } = await quick.catalog.get(items[0].id);

// Items and quantities only. Price, tax and currency come from the server.
const { data: order } = await quick.checkout.create(
  { items: [{ catalogItemId: product.id, quantity: 1 }], email },
  crypto.randomUUID(),          // idempotency key
);`}</Snippet>
					<div className={textProse}>
						<p>
							The response carries a provider-neutral next action, a client
							secret, an approval URL, a redirect, or nothing more to do, so the
							same code works whichever payment provider the workspace
							connected.
						</p>
					</div>
				</TextSection>

				<TextSection title="A form that writes a record">
					<div className={textProse}>
						<p>
							Writing real records needs permissions a browser key never
							carries. Post the form to your own route handler and call from
							there.
						</p>
					</div>
					<Snippet>{`// server only, never a NEXT_PUBLIC_ or VITE_ variable
import { createQuickServer } from "@quickengine/quick";

const quick = createQuickServer({
  baseUrl: process.env.QUICKDASH_API_URL!,
  workspaceId: process.env.QUICKDASH_WORKSPACE_ID!,
  credential: { type: "scoped", token: process.env.QUICKDASH_API_KEY! },
});

await quick.clients.create({ name, email, notes }, crypto.randomUUID());`}</Snippet>
				</TextSection>
			</>
		),
	},

	// ── A contract. The HTTP surface, for anyone not using the client. ───────
	api: {
		title: "The HTTP contract.",
		lede: "One base URL, one envelope, one idempotency rule. Everything the dashboard does goes through here, and so can you.",
		body: (
			<>
				<TextSection title="Base URL and shape">
					<div className={textProse}>
						<p>
							Every route is under <code>/v1</code>. Successful responses are
							wrapped, so a payload can carry metadata without changing the
							shape of your parsing.
						</p>
					</div>
					<Snippet>{`GET ${API_BASE}/v1/catalog

{ "data": [ ... ], "meta": { "requestId": "req_..." } }`}</Snippet>
					<div className={textProse}>
						<p>
							Quote the <code>requestId</code> when you report a problem. It is
							how we find your exact request in the logs rather than guessing
							from a timestamp.
						</p>
					</div>
				</TextSection>

				<TextSection title="Credentials">
					<div className="flex flex-col">
						<Row term="site">
							Browser-safe. One workspace, locked to the origins you register.
							Reads and checkout. Meant to be in page source.
						</Row>
						<Row term="publishable">
							Browser-safe, for telemetry and events. Public by design.
						</Row>
						<Row term="scoped">
							Server only. Carries exactly the permissions you granted it.
						</Row>
						<Row term="secret">
							Server only, full access. Use a scoped key instead wherever you
							can.
						</Row>
						<Row term="session">
							A signed-in person, from the customer or account channel.
						</Row>
					</div>
					<div className={textProse}>
						<p>
							A credential is only valid in its own channel. A customer session
							presented on a server route, or a server key in a storefront
							channel, is refused, and every route is tested for exactly that on
							every build.
						</p>
					</div>
				</TextSection>

				<TextSection title="Idempotency">
					<div className={textProse}>
						<p>
							Send a unique key with every write. A retried request replays the
							original result instead of creating a second record, which is what
							makes a double-tapped button and a duplicated webhook safe.
						</p>
					</div>
					<Snippet>{`POST ${API_BASE}/v1/checkout
Idempotency-Key: 4f1c...`}</Snippet>
				</TextSection>

				<TextSection title="Rate limits">
					<div className="flex flex-col">
						<Row term="600 / minute">
							Reads. Fails open, if our limiter is unreachable the request is
							allowed.
						</Row>
						<Row term="120 / minute">Writes. Fails closed.</Row>
						<Row term="300 / minute">Telemetry. Fails closed.</Row>
					</div>
					<div className={textProse}>
						<p>
							Budgets scale with plan. Every response carries the remaining
							budget, not just the rejections, so a well-behaved client can slow
							down <em>before</em> it starts getting refused. A rejection adds{" "}
							<code>Retry-After</code>.
						</p>
						<p>
							Budgets are keyed to the API key or user, never the IP address
							otherwise one customer behind a shared network throttles their
							neighbours.
						</p>
					</div>
				</TextSection>

				<TextSection title="The full reference">
					<div className={textProse}>
						<p>
							The complete specification is generated from the routes themselves
							and served by the API, so it cannot drift from the server's actual
							behaviour. A test walks the real route table on every build and
							fails if anything is missing from it.
						</p>
					</div>
					<Snippet>{`curl ${API_BASE}/openapi.json`}</Snippet>
				</TextSection>
			</>
		),
	},

	// ── A reference. The client in detail. ───────────────────────────────────
	sdks: {
		title: "One package, two sides.",
		lede: "@quickengine/quick covers the browser and the server. Which constructor you use depends on whether the code can keep a secret.",
		body: (
			<>
				<TextSection title="Install">
					<Snippet>{`pnpm add @quickengine/quick`}</Snippet>
					<div className={textProse}>
						<p>
							Ships ESM and CommonJS, with a separate browser entry point. CI
							packs the published tarball and installs it into an empty project
							on every build, so the thing on npm is the thing that was tested.
						</p>
					</div>
				</TextSection>

				<TextSection title="In the browser">
					<Snippet>{`import { createQuickConnect } from "@quickengine/quick/browser";

const quick = createQuickConnect({
  baseUrl: "${API_BASE}",
  workspaceId: import.meta.env.VITE_QUICK_WORKSPACE_ID,
  credential: { type: "site", key: import.meta.env.VITE_QUICK_SITE_KEY },
});`}</Snippet>
					<div className={textProse}>
						<p>
							The browser entry deliberately cannot construct a server
							credential. That is a compile-time boundary, not a convention the
							mistake it prevents is the one that matters most.
						</p>
					</div>
				</TextSection>

				<TextSection title="On the server">
					<Snippet>{`import { createQuickServer } from "@quickengine/quick";

const quick = createQuickServer({
  baseUrl: process.env.QUICKDASH_API_URL!,
  workspaceId: process.env.QUICKDASH_WORKSPACE_ID!,
  credential: { type: "scoped", token: process.env.QUICKDASH_API_KEY! },
});`}</Snippet>
				</TextSection>

				<TextSection title="What every call returns">
					<Snippet>{`const { data, requestId } = await quick.catalog.list();`}</Snippet>
					<div className={textProse}>
						<p>
							Always the same two fields. <code>data</code> is typed per
							operation; <code>requestId</code> is the one to quote if something
							went wrong. A <code>204</code> resolves with{" "}
							<code>data: undefined</code> rather than throwing.
						</p>
						<p>
							Writes take the payload first and an idempotency key second. It is
							a required argument rather than an option, because an optional
							safety mechanism is one that gets left out.
						</p>
					</div>
				</TextSection>
			</>
		),
	},

	// ── A short honest note. Nothing invented. ───────────────────────────────
	cli: {
		title: "The quick command.",
		lede: "Project scaffolding and workspace plumbing from a terminal, so connecting a project does not start with copying files between folders.",
		body: (
			<>
				<TextSection title="Install">
					<Snippet>{`pnpm add -g @quickengine/cli
quick --help`}</Snippet>
				</TextSection>

				<TextSection title="What it is for">
					<div className={textProse}>
						<p>
							Generating a connected project, wiring its environment to a
							workspace, and the setup steps that are otherwise a checklist
							somebody follows by hand and gets wrong once.
						</p>
					</div>
				</TextSection>

				<TextSection title="Why there is no command list here">
					<div className={textProse}>
						<p>
							The CLI is young and its surface is still moving. A list on a
							marketing page goes stale the first week and then actively
							misleads people, which is worse than not having one.
						</p>
						<p>
							<code>quick --help</code> is generated from the commands that
							actually exist, so it is correct by construction. When the surface
							settles, it will be documented here properly.
						</p>
					</div>
				</TextSection>
			</>
		),
	},
};

function SectionPage() {
	const { section } = Route.useParams();
	const doc = SECTIONS[section];

	// Unknown slug is a 404, not an empty shell.
	if (!doc) throw notFound();

	return (
		<TextPage title={doc.title} lede={doc.lede}>
			{doc.body}
		</TextPage>
	);
}

export const Route = createFileRoute("/docs/$section")({
	component: SectionPage,
});
