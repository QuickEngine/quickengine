import { describe, expect, it } from "vitest";
import { actionResult, cents } from "./action-result";

describe("money form values", () => {
	it.each([
		["24", 2_400],
		["24.00", 2_400],
		["$24.00", 2_400],
		["1,024.50", 102_450],
	])("parses %s as integer cents", (value, expected) => {
		expect(cents(value)).toBe(expected);
	});

	it("returns a recoverable action error for invalid form input", async () => {
		await expect(
			actionResult(async () => cents("24.001"), "Fallback"),
		).resolves.toEqual({
			error:
				"Enter a valid price, such as 24.00, with no more than two decimals.",
			completionId: null,
		});
	});
});
