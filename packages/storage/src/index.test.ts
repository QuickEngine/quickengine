import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLocalStorageProvider,
	createVercelBlobStorageProvider,
} from "./index";

vi.mock("@vercel/blob", () => ({
	del: vi.fn(),
	issueSignedToken: vi.fn(),
	presignUrl: vi.fn(),
	put: vi.fn(),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("storage providers", () => {
	it("attests local object size and checksum", async () => {
		const provider = createLocalStorageProvider();
		const stored = await provider.put({
			bucket: "documents",
			key: "workspace/document/version",
			body: "hello",
			contentType: "text/plain",
		});

		expect(stored).toMatchObject({
			provider: "local",
			bucket: "documents",
			key: "workspace/document/version",
			size: 5,
			checksumSha256:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
		await expect(
			provider.delete({ ...stored, provider: "another-provider" }),
		).rejects.toThrow("STORAGE_PROVIDER_MISMATCH");
	});

	it("keeps Vercel objects private and grants only short-lived signed reads", async () => {
		vi.mocked(put).mockResolvedValue({
			url: "https://private-blob.example/object",
			downloadUrl: "https://private-blob.example/object?download=1",
			pathname: "documents/workspace/document/version",
			contentType: "text/plain",
			contentDisposition: "inline",
			etag: "etag",
		});
		const validUntil = Date.now() + 300_000;
		vi.mocked(issueSignedToken).mockResolvedValue({
			clientSigningToken: "client-signing-token",
			delegationToken: "delegation-token",
			validUntil,
		});
		vi.mocked(presignUrl).mockResolvedValue({
			presignedUrl: "https://private-blob.example/object?signed=1",
		});

		const provider = createVercelBlobStorageProvider({ token: "test-token" });
		const stored = await provider.put({
			bucket: "documents",
			key: "workspace/document/version",
			body: "hello",
			contentType: "text/plain",
		});
		expect(stored).not.toHaveProperty("url");
		expect(put).toHaveBeenCalledWith(
			"documents/workspace/document/version",
			expect.any(ArrayBuffer),
			expect.objectContaining({
				access: "private",
				addRandomSuffix: false,
				allowOverwrite: true,
				token: "test-token",
			}),
		);

		const access = await provider.createDownloadAccess(stored, {
			expiresInSeconds: 300,
		});
		expect(access).toEqual({
			url: "https://private-blob.example/object?signed=1",
			expiresAt: new Date(validUntil),
		});
		expect(issueSignedToken).toHaveBeenCalledWith(
			expect.objectContaining({
				operations: ["get"],
				pathname: "documents/workspace/document/version",
			}),
		);
		expect(presignUrl).toHaveBeenCalledWith(
			expect.objectContaining({ delegationToken: "delegation-token" }),
			expect.objectContaining({ access: "private", operation: "get" }),
		);

		await provider.delete(stored);
		expect(del).toHaveBeenCalledWith(
			"documents/workspace/document/version",
			expect.objectContaining({ token: "test-token" }),
		);
	});
});
