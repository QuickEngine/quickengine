import { describe, expect, it } from "vitest";
import { accountSecurityGuidedGoal } from "./guided-actions";

describe("supplemental guided goals", () => {
	it("keeps Account security optional and outside the module graph", () => {
		expect(accountSecurityGuidedGoal.surface).toBe("account");
		expect(accountSecurityGuidedGoal.optional).toBe(true);
		expect(accountSecurityGuidedGoal.steps.map((step) => step.id)).toEqual([
			"account:security:review",
			"account:security:2fa",
		]);
		expect(accountSecurityGuidedGoal.steps[1]?.optional).toBe(true);
	});
});
