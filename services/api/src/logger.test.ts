import { describe, expect, it } from "vitest";
import { createJsonLogger, redact } from "./logger";

describe("structured API logging", () => {
	it("recursively redacts credential-shaped fields", () => {
		expect(
			redact({
				authorization: "Bearer secret",
				nested: { api_key: "qsk_secret", password: "password" },
				requestId: "req_1",
			}),
		).toEqual({
			authorization: "[REDACTED]",
			nested: { api_key: "[REDACTED]", password: "[REDACTED]" },
			requestId: "req_1",
		});
	});

	it("emits JSON at or above the configured level", () => {
		const lines: string[] = [];
		const logger = createJsonLogger({
			level: "warn",
			service: "test-api",
			sink: (line) => lines.push(line),
		});

		logger.info("ignored");
		logger.warn("kept", { token: "secret", workspaceId: "workspace_1" });

		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
			level: "warn",
			message: "kept",
			service: "test-api",
			token: "[REDACTED]",
			workspaceId: "workspace_1",
		});
	});
});
