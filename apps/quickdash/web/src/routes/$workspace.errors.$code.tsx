import { createFileRoute } from "@tanstack/react-router";
import { OutletError, OutletNotFound } from "../components/outlet-error";

/**
 * Every error state this console can show, on demand.
 *
 * ── Why one route and not seven ──────────────────────────────────────────────
 *
 * `/{workspace}/errors/404`, `/errors/500`, `/errors/403` and the rest all land
 * here. The screen is chosen by `presentRequestError`, which reads a STATUS —
 * so handing it a status is the whole implementation, and a new status covered
 * there is covered here the same day with no route to remember to add.
 *
 * 🔑 These render the REAL component, from a real `RequestError`, through the
 * same code path a genuine failure takes. Nothing is a mock-up: an error page
 * is the hardest screen in a product to look at deliberately, which is exactly
 * why they rot — you cannot review the 500 without breaking something, so
 * nobody reviews the 500.
 *
 * ⚠️ Not linked from the navigation. It is a workbench, and a console with
 * "Errors" in its sidebar reads as a console that expects to fail.
 */

/**
 * A failure shaped exactly like the SDK's.
 *
 * `presentRequestError` reads `status` and `requestId` off the error, so a
 * plain `Error` with those two fields is indistinguishable from the real thing
 * — which is the point. A bespoke preview object would let the preview drift
 * away from what the console actually shows.
 */
function syntheticError(status: number): Error {
	const error = new Error(`Synthetic ${status} for design review`);
	Object.assign(error, {
		status,
		// A fixed id rather than a random one, so the copy button can be tested
		// and screenshots of this page stay identical between visits.
		requestId: "req_preview_000000000000",
	});
	return error;
}

function ErrorPreview() {
	const { code } = Route.useParams();

	// 404 has its own component: it is a routing outcome rather than a failed
	// request, and it is the one screen with no error object behind it.
	if (code === "404") return <OutletNotFound />;

	const status = Number(code);
	if (!Number.isFinite(status) || status < 400 || status > 599) {
		return <OutletNotFound />;
	}

	return (
		<OutletError
			error={syntheticError(status)}
			// Reloading is the honest "try again" here: there is no failed query to
			// re-run, and a no-op button would misrepresent what the control does
			// on a real failure.
			reset={() => window.location.reload()}
		/>
	);
}

export const Route = createFileRoute("/$workspace/errors/$code")({
	/* 🔴 Without these, a fault here escapes to the ROOT boundary, which
	   replaces the entire application: the sidebar, the header and the page
	   you were on all vanish behind a wall. Registered here, the console
	   survives and the card appears in the outlet where the page would have
	   been, which is what every other route already does. */
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	component: ErrorPreview,
});
