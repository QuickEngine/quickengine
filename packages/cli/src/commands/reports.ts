import type { Command } from "commander";
import { buildClient } from "../config";
import { line, printJson } from "../output";

const money = (cents: number, currency: string) =>
	`${(cents / 100).toFixed(2)} ${currency}`;

/** Shared range flags: every report accepts the same window. */
const withRange = (command: Command) =>
	command
		.option("--from <iso>", "Range start (defaults to 30 days before --to)")
		.option("--to <iso>", "Range end (defaults to now)")
		.option("--time-zone <zone>", "IANA time zone the range is bucketed in")
		.option("--granularity <unit>", "day, week, or month");

type RangeOptions = {
	from?: string;
	to?: string;
	timeZone?: string;
	granularity?: string;
	json?: boolean;
};

const range = (options: RangeOptions) => ({
	from: options.from,
	to: options.to,
	timeZone: options.timeZone,
	granularity: options.granularity as never,
});

export function registerReportCommands(program: Command): void {
	const reports = program
		.command("reports")
		.description("Read the workspace's reports and analytics");

	withRange(
		reports
			.command("workspace")
			.description("Cross-module snapshot for a date range")
			.option("--json", "Output JSON"),
	).action(async (options: RangeOptions) => {
		const { data } = await buildClient().client.reports.workspace(
			range(options),
		);
		if (options.json) return printJson(data);
		line(`${data.workspace.name}  (${data.range.from} → ${data.range.to})`);
		for (const [name, value] of Object.entries(data)) {
			if (name === "workspace" || name === "range") continue;
			const s = value as { available: boolean; data: unknown };
			if (!s || typeof s.available !== "boolean") continue;
			// An unavailable section means the module is off — not that the value is zero.
			line(
				s.available
					? `  ${name}: ${JSON.stringify(s.data)}`
					: `  ${name}: (module not enabled)`,
			);
		}
	});

	withRange(
		reports
			.command("revenue")
			.description("Collected and refunded revenue, split by currency")
			.option("--json", "Output JSON"),
	).action(async (options: RangeOptions) => {
		const { data } = await buildClient().client.reports.revenue(range(options));
		if (options.json) return printJson(data);
		if (!data.collected.length && !data.refunded.length)
			return line("No revenue in range.");
		// Currencies are reported separately and never summed together.
		for (const point of data.collected)
			line(
				`  collected  ${point.bucket}  ${money(Number(point.amountCents ?? 0), String(point.currency ?? ""))}`,
			);
		for (const point of data.refunded)
			line(
				`  refunded   ${point.bucket}  ${money(Number(point.amountCents ?? 0), String(point.currency ?? ""))}`,
			);
	});

	withRange(
		reports
			.command("traffic")
			.description("Self-reported site traffic over time")
			.option("--json", "Output JSON")
			.option("--summary", "Show totals instead of the series"),
	).action(async (options: RangeOptions & { summary?: boolean }) => {
		const client = buildClient().client;
		if (options.summary) {
			const { data } = await client.reports.trafficSummary(range(options));
			if (options.json) return printJson(data);
			line(
				`views ${data.views}  visitors ${data.visitors}  sessions ${data.sessions}`,
			);
			return;
		}
		const { data } = await client.reports.traffic(range(options));
		if (options.json) return printJson(data);
		if (!data.length) return line("No traffic in range.");
		for (const point of data)
			line(`  ${point.bucket}  ${point.count ?? 0} views`);
	});
}
