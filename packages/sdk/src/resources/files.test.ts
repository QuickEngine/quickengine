import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const document = {
	id: "00000000-0000-4000-8000-000000001a03",
	workspaceId: "workspace_123",
	title: "Agreement",
	status: "active" as const,
	folderId: null,
	description: null,
	currentVersionNumber: 1,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = (payload: unknown = document) => {
	// Fresh Response per call: a body can only be read once.
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementation(
			async () =>
				new Response(JSON.stringify({ data: payload }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("files resource", () => {
	it("lists only root folders when asked", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.files.listFolders({ rootOnly: true });
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/file-folders?rootOnly=true",
		);
	});

	it("filters documents by folder and status", async () => {
		const { quick, fetcher } = server({ items: [], page: {} });
		await quick.files.list({ folderId: "folder-1", status: "archived" });
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/documents?folderId=folder-1&status=archived",
		);
	});

	it("creates a folder with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.files.createFolder({ name: "Contracts" }, "fil-create-1");
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/file-folders");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"fil-create-1",
		);
	});

	it("moves a document through trash before deletion", async () => {
		const { quick, fetcher } = server();
		await quick.files.setStatus(document.id, "trashed", "fil-trash-1");
		await quick.files.delete(document.id, "fil-delete-1");

		expect(fetcher.mock.calls[0]?.[0]).toBe(
			`https://api.quickengine.test/v1/documents/${document.id}/status`,
		);
		expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
			status: "trashed",
		});
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			`https://api.quickengine.test/v1/documents/${document.id}`,
		);
		expect(fetcher.mock.calls[1]?.[1]?.method).toBe("DELETE");
	});

	it("releases a quarantined version over its own route", async () => {
		const { quick, fetcher } = server();
		await quick.files.releaseVersion("version-1", "fil-release-1");
		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/file-versions/version-1/release",
		);
		expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
	});
});
