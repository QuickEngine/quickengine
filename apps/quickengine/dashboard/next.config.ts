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
