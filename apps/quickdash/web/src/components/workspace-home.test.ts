import { describe, expect, it } from "vitest";
import type { FirstActionChecklistItem } from "../_lib/first-action-checklist";
import { buildWorkspaceHomeModel } from "./workspace-home";

const items: readonly FirstActionChecklistItem[] = [
	{
		id: "products-services:create",
		label: "Add a product",
		description: "Build the catalog.",
		completed: false,
		steps: [
			{
				id: "products-services:create:details",
				label: "Add product details",
				description: "Give the first product a name and price.",
				href: "/workspace/products-services?intent=create",
				completed: false,
				optional: false,
				isNext: true,
			},
		],
	},
	{
		id: "client-records:create",
		label: "Add a client",
		description: "Start the client list.",
		completed: false,
		steps: [
			{
				id: "client-records:create:details",
				label: "Add client details",
				description: "Create the first useful client record.",
				href: "/workspace/client-records?intent=create",
				completed: false,
				optional: false,
				isNext: false,
			},
			{
				id: "client-records:create:note",
				label: "Add a note",
				description: "Optional context.",
				href: "/workspace/client-records?intent=note",
				completed: false,
				optional: true,
				isNext: false,
			},
		],
	},
];

describe("workspace Home model", () => {
	it("uses the real next step and one distinct action per outcome", () => {
		expect(buildWorkspaceHomeModel(items)).toEqual({
			nextAction: {
				id: "products-services:create:details",
				label: "Add product details",
				description: "Give the first product a name and price.",
				href: "/workspace/products-services?intent=create",
			},
			quickActions: [
				{
					id: "client-records:create:details",
					label: "Add client details",
					description: "Create the first useful client record.",
					href: "/workspace/client-records?intent=create",
				},
			],
			completedRequiredSteps: 0,
			totalRequiredSteps: 2,
		});
	});

	it("shows caught-up state only after every required step is complete", () => {
		const completed = items.map((item) => ({
			...item,
			completed: true,
			steps: item.steps.map((step) => ({
				...step,
				completed: !step.optional,
				isNext: false,
			})),
		}));
		expect(buildWorkspaceHomeModel(completed)).toMatchObject({
			nextAction: null,
			quickActions: [],
			completedRequiredSteps: 2,
			totalRequiredSteps: 2,
		});
	});
});
