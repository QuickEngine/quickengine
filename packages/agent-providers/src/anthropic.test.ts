import { describe, expect, it, vi } from "vitest";
import {
	createAnthropicTextProvider,
	DEFAULT_ANTHROPIC_HAIKU_MODEL,
} from "./anthropic";

function request(fetch: typeof globalThis.fetch) {
	return createAnthropicTextProvider({ apiKey: "test-key", fetch }).complete({
		runId: "run-1",
		messages: [{ role: "user", content: "I run a neighborhood bakery" }],
		tools: [],
		maxOutputTokens: 180,
		signal: new AbortController().signal,
	});
}

describe("createAnthropicTextProvider", () => {
	it("calls Haiku with bounded output and reports cost", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					content: [{ type: "text", text: '{"recipeId":"bakery"}' }],
					usage: { input_tokens: 120, output_tokens: 30 },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		await expect(request(fetch)).resolves.toEqual({
			content: '{"recipeId":"bakery"}',
			toolCalls: [],
			usage: { inputTokens: 120, outputTokens: 30, costMicros: 270 },
		});
		expect(fetch).toHaveBeenCalledOnce();
		const [url, init] = fetch.mock.calls[0] ?? [];
		expect(url).toBe("https://api.anthropic.com/v1/messages");
		expect(init?.headers).toMatchObject({
			"anthropic-version": "2023-06-01",
			"x-api-key": "test-key",
		});
		expect(JSON.parse(String(init?.body))).toEqual({
			model: DEFAULT_ANTHROPIC_HAIKU_MODEL,
			max_tokens: 180,
			messages: [{ role: "user", content: "I run a neighborhood bakery" }],
		});
	});

	it("returns a stable status error without leaking the provider body", async () => {
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(
				new Response("secret provider detail", { status: 429 }),
			);
		await expect(request(fetch)).rejects.toThrow("ANTHROPIC_HTTP_429");
	});

	it("rejects malformed and empty responses", async () => {
		const malformed = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(new Response(JSON.stringify({ content: [] })));
		await expect(request(malformed)).rejects.toThrow(
			"ANTHROPIC_INVALID_RESPONSE",
		);

		const empty = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					content: [{ type: "text", text: "" }],
					usage: { input_tokens: 1, output_tokens: 0 },
				}),
			),
		);
		await expect(request(empty)).rejects.toThrow("ANTHROPIC_EMPTY_RESPONSE");
	});

	it("does not pretend to support tools", async () => {
		const provider = createAnthropicTextProvider({
			apiKey: "test-key",
			fetch: vi.fn<typeof globalThis.fetch>(),
		});
		await expect(
			provider.complete({
				runId: "run-1",
				messages: [{ role: "user", content: "hello" }],
				tools: [
					{
						id: "tool",
						description: "tool",
						inputSchema: { parse: (value: unknown) => value } as never,
					},
				],
				maxOutputTokens: 10,
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("ANTHROPIC_TEXT_PROVIDER_DOES_NOT_SUPPORT_TOOLS");
	});
});
