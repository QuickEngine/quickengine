import { describe, expect, it } from "vitest";
import { admitOrder } from "../src/gauges";
import { meter } from "../src/metering";
import { insertOrg } from "./helpers";

/**
 * One order past the ceiling, then nothing.
 *
 * 🔴 The order that first crosses the limit belongs to a real shopper standing
 * at a checkout. Refusing it outright means a merchant loses a genuine sale to a
 * limit they may never have seen, and they blame the platform rather than read a
 * plan page. One grace order costs nothing and turns a wall into a warning.
 *
 * ⚠️ Exactly one. If this ever becomes a percentage, the guarantee "your next
 * order is your last" stops being a sentence anybody can act on.
 */
describe("the order soft landing on Free", () => {
	const fill = async (scope: string, orders: number) => {
		await insertOrg(scope);
		if (orders > 0) {
			await meter({
				scopeId: scope,
				meter: "ordersPerMonth",
				amount: orders,
			});
		}
	};

	it("admits an order well inside the ceiling", async () => {
		const scope = "00000000-0000-4000-8000-00000000d001";
		await fill(scope, 10);
		expect((await admitOrder(scope)).allowed).toBe(true);
	});

	it("admits the order that reaches the ceiling", async () => {
		const scope = "00000000-0000-4000-8000-00000000d002";
		await fill(scope, 24);
		expect((await admitOrder(scope)).allowed).toBe(true);
	});

	it("admits ONE order past the ceiling, the soft landing", async () => {
		const scope = "00000000-0000-4000-8000-00000000d003";
		await fill(scope, 25);
		const room = await admitOrder(scope);
		expect(room.allowed).toBe(true);
		// Still reported as over, so the merchant's usage card is already shouting.
		expect(room.state).toBe("over");
	});

	it("refuses everything after the grace order is spent", async () => {
		const scope = "00000000-0000-4000-8000-00000000d004";
		await fill(scope, 26);
		expect((await admitOrder(scope)).allowed).toBe(false);
	});

	it("keeps refusing far beyond the ceiling", async () => {
		// The grace is one order, not a permanent softening of the limit.
		const scope = "00000000-0000-4000-8000-00000000d005";
		await fill(scope, 60);
		expect((await admitOrder(scope)).allowed).toBe(false);
	});
});
