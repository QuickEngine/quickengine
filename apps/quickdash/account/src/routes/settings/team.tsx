import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings/team` — kept only so existing links keep working.
 *
 * 🔴 This was a blank page, and rebuilding it would have been the wrong fix. The
 * real team screen lives at `/team` and is 452 lines of working code: members,
 * invitations, roles and permission checks. A second team page would duplicate
 * all of it and the two would drift apart, which is how a product ends up with
 * two screens that disagree about who is on the team.
 *
 * ⚠️ Deliberately NOT deleted. The route was left in place in 2026-08 so
 * navigation and older links would not 404, and that reasoning still holds —
 * anything bookmarked or linked here now arrives at the page it wanted.
 */
export const Route = createFileRoute("/settings/team")({
	beforeLoad: () => {
		throw redirect({ to: "/team", replace: true });
	},
});
