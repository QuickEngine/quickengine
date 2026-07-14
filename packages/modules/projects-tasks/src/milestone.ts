import { z } from "zod";
import { calendarDateSchema } from "./project";

export const MILESTONE_STATUSES = ["open", "completed", "cancelled"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

const milestoneDetailsFields = {
	projectId: z.uuid(),
	name: z.string().trim().min(1).max(200),
	description: z.string().trim().max(10_000).nullable().default(null),
	dueDate: calendarDateSchema.nullable().default(null),
	position: z.number().int().nonnegative().max(2_147_483_647).default(0),
	metadata: z.record(z.string(), z.unknown()).default({}),
} as const;

export const milestoneDetailsInputSchema = z.object(milestoneDetailsFields);

export const milestoneInputSchema = z.object({
	...milestoneDetailsFields,
	status: z.enum(MILESTONE_STATUSES).default("open"),
});

export type MilestoneInput = z.input<typeof milestoneInputSchema>;
export type Milestone = z.output<typeof milestoneInputSchema>;
export type MilestoneDetailsInput = z.input<typeof milestoneDetailsInputSchema>;

const MILESTONE_TRANSITIONS: Record<
	MilestoneStatus,
	readonly MilestoneStatus[]
> = {
	open: ["completed", "cancelled"],
	completed: ["open"],
	cancelled: ["open"],
};

export function canTransitionMilestone(
	from: MilestoneStatus,
	to: MilestoneStatus,
): boolean {
	return MILESTONE_TRANSITIONS[from].includes(to);
}
