import { describe, expect, it } from "vitest";
import { createR2StorageProvider } from "./index";

/**
 * The R2 provider against the REAL bucket.
 *
 * 🔴 The unit tests prove key handling and traversal refusal without a network.
 * They cannot prove that R2 accepts what we sign — a wrong region string, an
 * unencoded key, a presigned URL the service rejects. Those only fail for real.
 *
 * ⚠️ OPT-IN. Skipped unless the R2 credentials are present, so an ordinary
 * `pnpm test` and CI never depend on Cloudflare being reachable.
 *
 *   R2_ENDPOINT=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
 *   R2_BUCKET=… R2_PUBLIC_BUCKET=… R2_PUBLIC_BASE_URL=… \
 *   pnpm --filter @quickengine/storage test
 *
 * Everything it writes, it deletes.
 */

const env = {
	endpoint: process.env.R2_ENDPOINT,
	accessKeyId: process.env.R2_ACCESS_KEY_ID,
	secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
	bucket: process.env.R2_BUCKET,
	publicBucket: process.env.R2_PUBLIC_BUCKET,
	publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
};
const live = Object.values(env).every(Boolean);

/**
 * ⚠️ `Required<>` makes the keys non-optional but leaves `undefined` in each
 * value type, so it does not describe what `live` has already proven. Building
 * the options explicitly is what actually narrows them.
 */
const provider = live
	? createR2StorageProvider({
			endpoint: env.endpoint as string,
			accessKeyId: env.accessKeyId as string,
			secretAccessKey: env.secretAccessKey as string,
			bucket: env.bucket as string,
			publicBucket: env.publicBucket as string,
			publicBaseUrl: env.publicBaseUrl as string,
		})
	: null;

const run = `live-${Date.now()}`;
const WORKSPACE = "00000000-0000-4000-8000-0000000r2001";

describe.skipIf(!live)("R2 against the real bucket", () => {
	it("stores a private object and reads it back through a signed url", async () => {
		const body = `hello r2 ${run}`;
		const stored = await provider!.put({
			bucket: "documents",
			key: `${run}/note.txt`,
			body,
			contentType: "text/plain",
		});
		expect(stored.provider).toBe("r2");
		expect(stored.size).toBe(new TextEncoder().encode(body).byteLength);
		// Our own hash of the bytes we sent, never the provider's ETag.
		expect(stored.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

		const access = await provider!.createDownloadAccess(
			{ provider: "r2", bucket: "documents", key: `${run}/note.txt` },
			{ expiresInSeconds: 60 },
		);
		const response = await fetch(access.url);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(body);

		await provider!.delete({
			provider: "r2",
			bucket: "documents",
			key: `${run}/note.txt`,
		});
		const gone = await fetch(access.url);
		expect(gone.status).toBe(404);
	});

	/**
	 * 🔴 The private bucket must not be readable without a signature. If public
	 * access is ever switched on for it, every stored document becomes
	 * world-readable and no code here would notice — so the test notices.
	 */
	it("refuses an unsigned read of a private object", async () => {
		await provider!.put({
			bucket: "documents",
			key: `${run}/secret.txt`,
			body: "not for the public",
		});
		const unsigned = `${env.endpoint}/${env.bucket}/documents/${run}/secret.txt`;
		const response = await fetch(unsigned);
		expect(response.status).not.toBe(200);
		await provider!.delete({
			provider: "r2",
			bucket: "documents",
			key: `${run}/secret.txt`,
		});
	});

	it("publishes a public asset at a durable url", async () => {
		const asset = await provider!.putPublicAsset({
			workspaceId: WORKSPACE,
			key: `${run}/logo.txt`,
			body: "public bytes",
			contentType: "text/plain",
		});
		expect(asset.url.startsWith(env.publicBaseUrl!)).toBe(true);
		// No signature, no expiry: an <img src> cannot re-authorize itself.
		const response = await fetch(asset.url);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("public bytes");

		await provider!.deletePublicAsset({ provider: "r2", key: asset.key });
	});

	/** ⚠️ Cleanup jobs retry; deleting something already gone must succeed. */
	it("deletes twice without complaining", async () => {
		await provider!.put({
			bucket: "uploads",
			key: `${run}/twice.txt`,
			body: "x",
		});
		const locator = {
			provider: "r2" as const,
			bucket: "uploads" as const,
			key: `${run}/twice.txt`,
		};
		await provider!.delete(locator);
		await expect(provider!.delete(locator)).resolves.toBeUndefined();
	});

	it("refuses a locator belonging to another provider", async () => {
		await expect(
			provider!.delete({
				provider: "vercel-blob",
				bucket: "documents",
				key: "x",
			}),
		).rejects.toThrow("STORAGE_PROVIDER_MISMATCH");
	});

	it("refuses a key that tries to climb out of its workspace", async () => {
		await expect(
			provider!.putPublicAsset({
				workspaceId: WORKSPACE,
				key: "../other-workspace/logo.png",
				body: "x",
			}),
		).rejects.toThrow("STORAGE_KEY_INVALID");
	});

	it("refuses an expiry outside the allowed window", async () => {
		const locator = {
			provider: "r2" as const,
			bucket: "documents" as const,
			key: "x.txt",
		};
		await expect(
			provider!.createDownloadAccess(locator, { expiresInSeconds: 5 }),
		).rejects.toThrow("STORAGE_DOWNLOAD_EXPIRY_INVALID");
		await expect(
			provider!.createDownloadAccess(locator, { expiresInSeconds: 99_999 }),
		).rejects.toThrow("STORAGE_DOWNLOAD_EXPIRY_INVALID");
	});
});
