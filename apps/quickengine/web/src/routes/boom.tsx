import { createFileRoute, notFound } from "@tanstack/react-router";

/**
 * Dev-only trigger for the route error boundary, which is otherwise impossible
 * to look at without breaking something real.
 *
 * In a production build it 404s instead of throwing, so the route exists for
 * developers and does not exist for anybody else. Guarding it this way rather
 * than deleting the file means the next error-surface change can be checked the
 * same way.
 */
function Boom(): never {
	if (!import.meta.env.DEV) throw notFound();
	throw new Error("Deliberate error from /boom — the error boundary works.");
}

export const Route = createFileRoute("/boom")({
	component: Boom,
});
