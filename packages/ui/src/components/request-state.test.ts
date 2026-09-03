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
		// 🔴 503 is a TIMEOUT, not a server fault. Changed 2026-09-03.
		//
		// It used to fall through to the generic 500, which TAKES THE PAGE. Both
		// 503 and 504 are temporary by definition, so walling the console over
		// something that heals itself was the same overreaction the offline
		// screen used to make. They report themselves as one inline line now.
		[503, "timeout", "That service is busy"],
		[504, "timeout", "That took too long"],
		// The statuses that arrived with their own kinds in the same pass.
		[402, "plan-limit", "That needs a larger plan"],
		[413, "invalid", "That was too large to send"],
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

	/**
	 * 🔴 A programming mistake must not be reported as a connection problem.
	 *
	 * Every `fetch` failure is a TypeError, but so is `undefined.length`. Treating
	 * the whole class as "offline" sent an operator to check their internet after
	 * a panel crashed on a mis-shaped response — and hid the real bug behind a
	 * message that was simply untrue.
	 */
	it("does not blame the network for an ordinary crash", () => {
		expect(
			presentRequestError(
				new TypeError("Cannot read properties of undefined (reading 'length')"),
			),
		).toMatchObject({ code: "ERROR", kind: "server" });
	});

	it("still recognises the other browsers' wordings", () => {
		for (const message of [
			"NetworkError when attempting to fetch resource.",
			"Load failed",
		]) {
			expect(presentRequestError(new TypeError(message))).toMatchObject({
				code: "OFFLINE",
				kind: "network",
			});
		}
	});

	it("gives a malformed request its own words, not a shrug", () => {
		// 🔴 400 previously fell through to the generic "Something went wrong".
		// The suppliers page shipped a routing bug that surfaced as exactly that,
		// and the useless copy is part of why it needed a trace to find.
		for (const status of [400, 422]) {
			const presented = presentRequestError(
				Object.assign(new Error("bad"), { status }),
			);
			expect(presented).toMatchObject({
				code: String(status),
				kind: "invalid",
			});
			expect(presented.title).not.toMatch(/something went wrong/i);
		}
	});

	it("does not trust malformed request identifiers", () => {
		const error = Object.assign(new Error("no"), {
			status: 500,
			requestId: 123,
		});
		expect(presentRequestError(error).requestId).toBeNull();
	});
});
