import type {
	AgentMessage,
	AgentModelProvider,
	AgentModelTurn,
} from "@quickengine/agent-core";

export const DEFAULT_ANTHROPIC_HAIKU_MODEL = "claude-haiku-4-5";

type AnthropicProviderOptions = {
	apiKey: string;
	model?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	/** USD per million tokens, used only for the runtime's budget accounting. */
	inputCostPerMillionUsd?: number;
	outputCostPerMillionUsd?: number;
};

type AnthropicResponse = {
	content: Array<{ type: string; text?: string }>;
	usage: { input_tokens: number; output_tokens: number };
};

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseResponse(value: unknown): AnthropicResponse {
	if (!value || typeof value !== "object") {
		throw new Error("ANTHROPIC_INVALID_RESPONSE");
	}
	const response = value as Partial<AnthropicResponse>;
	if (
		!Array.isArray(response.content) ||
		!response.usage ||
		!isNonNegativeInteger(response.usage.input_tokens) ||
		!isNonNegativeInteger(response.usage.output_tokens)
	) {
		throw new Error("ANTHROPIC_INVALID_RESPONSE");
	}
	return response as AnthropicResponse;
}

function toAnthropicMessages(messages: readonly AgentMessage[]) {
	return messages.map((message) => {
		if (message.role === "tool") {
			throw new Error("ANTHROPIC_TEXT_PROVIDER_DOES_NOT_SUPPORT_TOOLS");
		}
		return { role: message.role, content: message.content };
	});
}

function costMicros(tokens: number, usdPerMillionTokens: number): number {
	return Math.ceil(tokens * usdPerMillionTokens);
}

/**
 * Bounded text-only Anthropic adapter for low-cost flows such as onboarding
 * recommendations. Tool use stays disabled until its translation and tests are explicit.
 */
export function createAnthropicTextProvider(
	options: AnthropicProviderOptions,
): AgentModelProvider {
	const apiKey = options.apiKey.trim();
	if (!apiKey) throw new Error("ANTHROPIC_API_KEY_REQUIRED");
	const model = options.model?.trim() || DEFAULT_ANTHROPIC_HAIKU_MODEL;
	const baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(
		/\/$/,
		"",
	);
	const request = options.fetch ?? globalThis.fetch;
	const inputRate = options.inputCostPerMillionUsd ?? 1;
	const outputRate = options.outputCostPerMillionUsd ?? 5;
	if (inputRate < 0 || outputRate < 0) {
		throw new Error("ANTHROPIC_INVALID_TOKEN_PRICE");
	}

	return {
		id: `anthropic:${model}`,
		async complete(input): Promise<AgentModelTurn> {
			if (input.tools.length > 0) {
				throw new Error("ANTHROPIC_TEXT_PROVIDER_DOES_NOT_SUPPORT_TOOLS");
			}
			const response = await request(`${baseUrl}/v1/messages`, {
				method: "POST",
				headers: {
					"anthropic-version": "2023-06-01",
					"content-type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify({
					model,
					max_tokens: input.maxOutputTokens,
					messages: toAnthropicMessages(input.messages),
				}),
				signal: input.signal,
			});
			if (!response.ok) {
				throw new Error(`ANTHROPIC_HTTP_${response.status}`);
			}
			const payload = parseResponse(await response.json());
			const content = payload.content
				.filter(
					(block) => block.type === "text" && typeof block.text === "string",
				)
				.map((block) => block.text)
				.join("");
			if (!content.trim()) throw new Error("ANTHROPIC_EMPTY_RESPONSE");

			return {
				content,
				toolCalls: [],
				usage: {
					inputTokens: payload.usage.input_tokens,
					outputTokens: payload.usage.output_tokens,
					costMicros:
						costMicros(payload.usage.input_tokens, inputRate) +
						costMicros(payload.usage.output_tokens, outputRate),
				},
			};
		},
	};
}
