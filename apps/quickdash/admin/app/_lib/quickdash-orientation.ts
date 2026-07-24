export type QuickDashOrientationStep = {
	title: string;
	description: string;
	placement:
		| "workspace-switcher"
		| "module-navigation"
		| "workspace-settings"
		| "account";
};

export function buildQuickDashOrientationSteps(input: {
	workspaceName: string;
}): QuickDashOrientationStep[] {
	return [
		{
			title: `${input.workspaceName} is ready`,
			description:
				"The workspace switcher at the top keeps each business and its data separate.",
			placement: "workspace-switcher",
		},
		{
			title: "Your tools live on the left",
			description:
				"QuickDash shows only the modules enabled for this workspace. Manage them later from QuickEngine Account.",
			placement: "module-navigation",
		},
		{
			title: "Workspace settings stay separate",
			description:
				"Use Manage workspace to change this workspace's modules and configuration without mixing them into daily work.",
			placement: "workspace-settings",
		},
		{
			title: "Your account is always within reach",
			description:
				"Open your profile for Account settings, security, and sign out. Those controls stay separate from workspace operations.",
			placement: "account",
		},
	];
}

export function getQuickDashOrientationPlacementClass(
	placement: QuickDashOrientationStep["placement"],
) {
	const mobile =
		"max-md:right-auto max-md:bottom-5 max-md:left-5 max-md:top-auto";
	switch (placement) {
		case "workspace-switcher":
			return `top-20 left-5 ${mobile}`;
		case "module-navigation":
			return `top-24 left-[calc(var(--sidebar-width)+1.25rem)] ${mobile}`;
		case "workspace-settings":
			return `bottom-8 left-[calc(var(--sidebar-width)+1.25rem)] ${mobile}`;
		case "account":
			return `top-20 right-5 ${mobile}`;
	}
}

export function getQuickDashOrientationNotchClass(
	placement: QuickDashOrientationStep["placement"],
) {
	switch (placement) {
		case "workspace-switcher":
			return "-top-1.5 left-10 border-t border-l";
		case "module-navigation":
			return "top-10 -left-1.5 border-b border-l";
		case "workspace-settings":
			return "bottom-10 -left-1.5 border-b border-l";
		case "account":
			return "-top-1.5 right-8 border-t border-l";
	}
}
