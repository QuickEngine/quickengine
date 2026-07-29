import { describe, expect, it } from "vitest";
import { presentRequestError } from "./request-state";

const requestError = (status: number, requestId = "request-123") =>
	Object.assign(new Error("Internal detail must not appear"), {
		status,
		requestId,
	});

describe("presentRequestError", () => {
	it.each([
		[401, "authentication", "Your session ended"],
		[403, "permission", "You don't have access"],
		[404, "not-found", "This resource wasn't found"],
		[409, "conflict", "This changed before we could finish"],
		[429, "rate-limit", "Too many requests"],
		[503, "server", "Something went wrong"],
	] as const)("maps %s without leaking raw errors", (status, kind, title) => {
		const result = presentRequestError(requestError(status));
		expect(result).toMatchObject({
			kind,
			title,
			requestId: "request-123",
		});
		expect(result.message).not.toContain("Internal detail");
	});

	it("recognizes browser connection failures", () => {
		expect(presentRequestError(new TypeError("Failed to fetch"))).toMatchObject(
			{
				code: "OFFLINE",
				kind: "network",
				requestId: null,
			},
		);
	});

	it("does not trust malformed request identifiers", () => {
		const error = Object.assign(new Error("no"), {
			status: 500,
			requestId: 123,
		});
		expect(presentRequestError(error).requestId).toBeNull();
	});
});
