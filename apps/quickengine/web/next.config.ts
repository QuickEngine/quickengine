import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: new URL("../../../.env.local", import.meta.url).pathname });
config({ path: new URL("../../../.env", import.meta.url).pathname });

const nextConfig: NextConfig = {
	transpilePackages: [
		"@quickengine/auth",
		"@quickengine/db",
		"@quickengine/ui",
	],
	// Allow testing the dev server from other devices on the LAN (e.g. a phone).
	// Without this, Next blocks cross-origin dev resources (HMR + client bundle),
	// so the page never hydrates and nothing interactive works.
	allowedDevOrigins: ["192.168.3.155"],
};

export default nextConfig;
