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
	// Re-anchored 2026-07-31 for the single-panel shell. The rail now sits INSIDE
	// the panel, which starts at the 16px page margin, so anything measured from
	// the viewport edge is 16px out — and the settings row moved to the bottom of
	// the rail rather than sitting beside it.
	const mobile =
		"max-md:right-auto max-md:bottom-5 max-md:left-5 max-md:top-auto";
	switch (placement) {
		case "workspace-switcher":
			// Below the header band, left edge on the rail.
			return `top-14 left-4 ${mobile}`;
		case "module-navigation":
			// Clear of the rail's right border, beside the module list.
			return `top-40 left-[calc(var(--sidebar-width)+2.5rem)] ${mobile}`;
		case "workspace-settings":
			// Beside the rail's pinned bottom group.
			return `bottom-8 left-[calc(var(--sidebar-width)+2.5rem)] ${mobile}`;
		case "account":
			// Below the header band, right edge on the panel.
			return `top-14 right-4 ${mobile}`;
	}
}

export function getQuickDashOrientationNotchClass(
	placement: QuickDashOrientationStep["placement"],
) {
	// Each notch sits on the edge FACING its target, offset to line up with the
	// control itself rather than the middle of the card.
	switch (placement) {
		// Up at the switcher chip, which starts past the 24px avatar.
		case "workspace-switcher":
			return "-top-1.5 left-14 border-t border-l";
		// Left at the module list.
		case "module-navigation":
			return "top-8 -left-1.5 border-b border-l";
		// Left at Feedback/Settings, pinned to the rail's bottom.
		case "workspace-settings":
			return "bottom-8 -left-1.5 border-b border-l";
		// Up at the avatar, which is the last control on the right.
		case "account":
			return "-top-1.5 right-4 border-t border-l";
	}
}
