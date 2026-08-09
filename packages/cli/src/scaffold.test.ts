import { describe, expect, it } from "vitest";
import sdkPackage from "../../sdk/package.json";
import { DEFAULT_API_URL, QUICK_SDK_VERSION } from "./defaults";
import { scaffoldFiles } from "./scaffold";

const input = {
	name: "my-backend",
	baseUrl: DEFAULT_API_URL,
	workspaceId: "00000000-0000-4000-8000-000000000001",
	sdkVersion: "0.1.0",
};

const fileMap = (files: ReturnType<typeof scaffoldFiles>) =>
	Object.fromEntries(files.map((f) => [f.path, f]));

describe("generated project", () => {
	it("writes a runnable project and nothing more", () => {
		const files = fileMap(scaffoldFiles(input));
		expect(Object.keys(files).sort()).toEqual([
			".env",
			".env.example",
			".gitignore",
			"README.md",
			"index.js",
			"package.json",
		]);
	});

	it("never commits the file that can hold a live key", () => {
		const files = fileMap(scaffoldFiles(input));
		// The distinction that matters: .env is ignored, .env.example is not.
		expect(files[".gitignore"].contents).toContain(".env\n");
		expect(files[".env.example"].contents).not.toMatch(/qsk_/);
	});

	it("writes the key owner-only when one is supplied", () => {
		const withKey = fileMap(scaffoldFiles({ ...input, key: "qsk_secret" }));
		expect(withKey[".env"].contents).toContain("qsk_secret");
		// A live credential on disk must not be world-readable.
		expect(withKey[".env"].mode).toBe(0o600);
	});

	it("leaves the key blank rather than inventing one", () => {
		const files = fileMap(scaffoldFiles(input));
		expect(files[".env"].contents).toContain("QUICKENGINE_KEY=\n");
	});

	it("targets the configured API and workspace, not a hardcoded default", () => {
		const files = fileMap(
			scaffoldFiles({ ...input, baseUrl: "http://localhost:3020" }),
		);
		expect(files[".env"].contents).toContain(
			"QUICKENGINE_API_URL=http://localhost:3020",
		);
		expect(files[".env"].contents).toContain(input.workspaceId);
	});

	it("uses the server entry point, because the key is secret", () => {
		const files = fileMap(scaffoldFiles(input));
		// createQuickServer, never createQuickBrowser — a qsk_ key in a browser
		// bundle would be a credential leak, so the template cannot suggest it.
		expect(files["index.js"].contents).toContain("createQuickServer");
		expect(files["index.js"].contents).not.toContain("createQuickBrowser");
	});

	it("demonstrates an idempotent write", () => {
		const files = fileMap(scaffoldFiles(input));
		// Running `npm start` twice must not create two records — that is the
		// property most worth teaching in the first thirty seconds.
		expect(files["index.js"].contents).toContain("`seed-${");
		expect(files["index.js"].contents).not.toContain("{ idempotencyKey:");
	});

	it("produces valid JSON for package.json", () => {
		const files = fileMap(scaffoldFiles(input));
		const parsed = JSON.parse(files["package.json"].contents);
		expect(parsed.name).toBe("my-backend");
		expect(parsed.type).toBe("module");
		expect(parsed.dependencies["@quickengine/quick"]).toBe("^0.1.0");
	});
});

describe("published contract", () => {
	it("uses the live QuickDash API and the current SDK version", () => {
		expect(DEFAULT_API_URL).toBe("https://api.quickdash.xyz");
		expect(QUICK_SDK_VERSION).toBe(sdkPackage.version);
	});
});
