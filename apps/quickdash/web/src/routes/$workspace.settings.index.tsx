import { createFileRoute } from "@tanstack/react-router";
import { settingsRedirect } from "./$workspace.settings";

/**
 * `/{workspace}/settings` lands on the first section rather than on nothing.
 *
 * ⚠️ In `beforeLoad`, so the redirect happens before anything renders and the
 * empty page never appears. Doing it in a component flashes a blank pane and
 * puts an extra entry in the history, so Back would bounce you forward again.
 */
export const Route = createFileRoute("/$workspace/settings/")({
	beforeLoad: ({ params }) => {
		throw settingsRedirect(params.workspace);
	},
});
