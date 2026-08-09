import { describe, expect, it, vi } from "vitest";
import {
	isPublicWebhookAddress,
	parseWebhookUrl,
	resolvePublicWebhookDestination,
} from "../src";

describe("outbound webhook destinations", () => {
	it.each([
		"http://customer.example/hook",
		"https://localhost/hook",
		"https://service.local/hook",
		"https://127.0.0.1/hook",
		"https://10.2.3.4/hook",
		"https://169.254.169.254/latest/meta-data",
		"https://[::1]/hook",
		"https://[::ffff:127.0.0.1]/hook",
		"https://user:password@customer.example/hook",
	])("rejects an unsafe literal destination: %s", (value) => {
		expect(() => parseWebhookUrl(value)).toThrow();
	});

	it.each([
		"0.0.0.0",
		"127.1.2.3",
		"172.16.4.2",
		"192.168.1.2",
		"100.64.0.1",
		"198.51.100.8",
		"::",
		"::1",
		"fc00::1",
		"fe80::1",
		"2001:db8::1",
		"::ffff:10.0.0.1",
	])("classifies a non-public address: %s", (value) => {
		expect(isPublicWebhookAddress(value)).toBe(false);
	});

	it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])(
		"accepts a public address: %s",
		(value) => {
			expect(isPublicWebhookAddress(value)).toBe(true);
		},
	);

	it("rejects a hostname when any DNS answer reaches a private network", async () => {
		const resolver = vi.fn(async () => [
			{ address: "93.184.216.34", family: 4 as const },
			{ address: "127.0.0.1", family: 4 as const },
		]);
		await expect(
			resolvePublicWebhookDestination(
				"https://customer.example/hook",
				resolver,
			),
		).rejects.toThrow("WEBHOOK_URL_PRIVATE");
	});

	it("returns the validated address that delivery must pin", async () => {
		const resolver = vi.fn(async () => [
			{ address: "93.184.216.34", family: 4 as const },
		]);
		await expect(
			resolvePublicWebhookDestination(
				"https://customer.example/hook",
				resolver,
			),
		).resolves.toMatchObject({
			url: new URL("https://customer.example/hook"),
			address: { address: "93.184.216.34", family: 4 },
		});
	});

	it("fails closed when DNS has no answer", async () => {
		await expect(
			resolvePublicWebhookDestination(
				"https://customer.example/hook",
				async () => [],
			),
		).rejects.toThrow("WEBHOOK_URL_UNRESOLVABLE");
	});
});
