import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import { SaveRailProvider } from "../components/settings/controls";

/**
 * `/{workspace}/settings` — configuring the workspace, as a place.
 *
 * 🔴 Settings used to be a DIALOG opened from the header, and the dialog was
 * the whole problem: it had no address, so a section could not be linked to,
 * reloaded, or left with the back button, and it covered the console while
 * claiming to be part of it. Configuring a workspace is not a detour from the
 * console, it is one of the things the console is for.
 *
 * ⚠️ The layout, not the content. Its child renders a section; the SECTION LIST
 * is rendered by `$workspace.tsx` into the console's own left sidebar, because
 * that is what "a sidebar context" means: the rail you already have showing a
 * different thing, rather than a second rail inside the page.
 *
 * 🔑 `SaveRailProvider` lives here rather than in each section, so a form's save
 * bar survives moving between sections without being torn down and rebuilt.
 */
export const Route = createFileRoute("/$workspace/settings")({
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	component: () => (
		<SaveRailProvider>
			<Outlet />
		</SaveRailProvider>
	),
});

/**
 * Bare `/settings` is not a page.
 *
 * ⚠️ A redirect rather than an index route that picks a section: two places
 * deciding what "the first section" means is how they come to disagree, and
 * `settingsGroups` already owns that answer for the rail.
 */
export const SETTINGS_HOME = "general";

export function settingsRedirect(workspace: string) {
	return redirect({
		to: "/$workspace/settings/$section",
		params: { workspace, section: SETTINGS_HOME },
	});
}
