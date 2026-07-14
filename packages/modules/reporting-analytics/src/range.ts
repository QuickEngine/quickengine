import { z } from "zod";

export const reportRangeInputSchema = z
	.object({
		from: z.date(),
		to: z.date(),
		timeZone: z.string().trim().default("UTC"),
		granularity: z.enum(["day", "week", "month"]).default("day"),
	})
	.superRefine((value, context) => {
		if (value.to <= value.from) {
			context.addIssue({
				code: "custom",
				message: "Report range end must follow its start",
				path: ["to"],
			});
		}
		if (value.to.getTime() - value.from.getTime() > 366 * 86_400_000) {
			context.addIssue({
				code: "custom",
				message: "Interactive report ranges are limited to 366 days",
				path: ["to"],
			});
		}
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone });
		} catch {
			context.addIssue({
				code: "custom",
				message: "Invalid IANA time zone",
				path: ["timeZone"],
			});
		}
	});

export type ReportRangeInput = z.input<typeof reportRangeInputSchema>;
