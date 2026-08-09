/**
 * The files `quick create app` writes.
 *
 * Deliberately framework-agnostic: a runnable script, the SDK, and one call that
 * proves the connection. Anything more opinionated would bake in a UI stack
 * decision that hasn't been made yet, and would age badly the moment it is.
 *
 * The generated project is meant to be *read*, not treated as a black box — it is
 * short enough to understand in one sitting, which is the point.
 */

export type ScaffoldInput = {
	name: string;
	baseUrl: string;
	workspaceId: string;
	/** Written to .env only when the user opts in; never to a committed file. */
	key?: string;
	sdkVersion: string;
};

export type ScaffoldFile = { path: string; contents: string; mode?: number };

const packageJson = (input: ScaffoldInput) =>
	`${JSON.stringify(
		{
			name: input.name,
			private: true,
			type: "module",
			scripts: {
				start: "node --env-file=.env index.js",
			},
			dependencies: {
				"@quickengine/quick": `^${input.sdkVersion}`,
			},
		},
		null,
		2,
	)}\n`;

const entrypoint =
	() => `import { createQuickServer } from "@quickengine/quick";

// A secret key must never reach a browser. This runs on a server, so it is safe
// here — and \`createQuickServer\` is the entry point that expects one.
const quick = createQuickServer({
  baseUrl: process.env.QUICKENGINE_API_URL,
  workspaceId: process.env.QUICKENGINE_WORKSPACE_ID,
  credential: { type: "secret", token: process.env.QUICKENGINE_KEY },
});

// Read something real, to prove the connection end to end.
const { data } = await quick.clients.list();
console.log(\`Connected. This workspace has \${data.items.length} client record(s).\`);

// Create one. Every write is idempotent: repeating a request with the same key
// returns the original result instead of creating a duplicate — which is what
// makes retrying safe.
const created = await quick.clients.create(
  { name: "Ada Lovelace", email: "ada@example.com" },
  \`seed-\${new Date().toISOString().slice(0, 10)}\`,
);
console.log("Created client:", created.data.id);
`;

const envFile = (input: ScaffoldInput) =>
	`QUICKENGINE_API_URL=${input.baseUrl}
QUICKENGINE_WORKSPACE_ID=${input.workspaceId}
QUICKENGINE_KEY=${input.key ?? ""}
`;

const envExample = (input: ScaffoldInput) =>
	`QUICKENGINE_API_URL=${input.baseUrl}
QUICKENGINE_WORKSPACE_ID=${input.workspaceId}
# Create a secret key in Account → API keys. Never commit this value.
QUICKENGINE_KEY=
`;

// `.env` is excluded, `.env.example` is not — the difference is the whole point.
const gitignore = () => `node_modules/
.env
`;

const readme = (input: ScaffoldInput) => `# ${input.name}

A minimal QuickEngine app: one file, one dependency, one working call.

## Run it

\`\`\`sh
npm install
npm start
\`\`\`

\`.env\` needs a secret key (\`qsk_…\`) from Account → API keys.${
	input.key ? " One has already been written for you." : ""
}

## What \`index.js\` shows

- **Reading** — \`quick.clients.list()\` proves the credential and workspace resolve.
- **Writing idempotently** — the create passes an \`idempotencyKey\`, so running
  \`npm start\` twice does not produce two Adas. Retrying is safe by construction.

## Where to go next

- \`quick\` — the CLI, for inspecting the same workspace from a terminal.
- \`quick.invoices\`, \`quick.quotes\`, \`quick.orders\`, … — same shape as \`clients\`.
- \`quick.activity.since(cursor)\` — everything that happened while you were away.
- Webhooks — have QuickEngine call *you* when something changes.
`;

/** Every file the new project consists of. Pure: callers decide where to write. */
export function scaffoldFiles(input: ScaffoldInput): ScaffoldFile[] {
	const files: ScaffoldFile[] = [
		{ path: "package.json", contents: packageJson(input) },
		{ path: "index.js", contents: entrypoint() },
		{ path: ".env.example", contents: envExample(input) },
		{ path: ".gitignore", contents: gitignore() },
		{ path: "README.md", contents: readme(input) },
	];
	// Owner-only: it may hold a live key.
	files.push({ path: ".env", contents: envFile(input), mode: 0o600 });
	return files;
}
