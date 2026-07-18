import { withSentryConfig } from "@sentry/nextjs";
import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: new URL("../../../.env.local", import.meta.url).pathname });
config({ path: new URL("../../../.env", import.meta.url).pathname });

const nextConfig: NextConfig = {
	transpilePackages: [
		"@quickengine/auth",
		"@quickengine/db",
		"@quickengine/types",
		"@quickengine/ui",
	],
	// Rewrites barrel imports (icon sets, radix) to direct per-module imports so
	// dev/compile only touches the icons actually used. Biggest local-dev speed lever.
	experimental: {
		optimizePackageImports: [
			"@phosphor-icons/react",
			"lucide-react",
			"radix-ui",
		],
	},
};

// Wrap with Sentry — uploads source maps at build (when org/project/token are
// set) and instruments the app. `silent` keeps local builds quiet.
export default withSentryConfig(nextConfig, {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	silent: !process.env.CI,
	widenClientFileUpload: true,
});
