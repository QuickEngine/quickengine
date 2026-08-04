import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

describe("customer messages resource", () => {
	it("creates and replies to a workspace customer conversation", async () => {
		const fetcher = vi.fn<typeof fetch>().mockImplementation(
			async () =>
				new Response(JSON.stringify({ data: { id: "conversation-1" } }), {
					status: 201,
				}),
		);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "scoped", token: "scoped_123" },
			fetcher,
		});

		await quick.messages.create({
			clientRecordId: "00000000-0000-4000-8000-000000000701",
			subject: "Your order",
			body: "It is ready.",
		});
		await quick.messages.reply("conversation-1", "See you soon.");

		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/customer-conversations",
		);
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			"https://api.quickengine.test/v1/customer-conversations/conversation-1/messages",
		);
	});
});
