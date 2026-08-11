import { createFileRoute, notFound } from "@tanstack/react-router";
import {
	AppErrorPage,
	MaintenancePage,
	NotFoundPage,
} from "@/components/error-page";

/**
 * Dev-only viewer: `/errors/404`, `/errors/500`, `/errors/503`.
 *
 * Two of these are otherwise only reachable by causing the thing they report,
 * and 503 is not reachable at all — nothing in the app renders it. Screens that
 * can only be seen by breaking something are the screens that ship unlooked-at.
 *
 * 🔴 `import.meta.env.DEV` is a BUILD-TIME constant. Vite substitutes `false` in
 * a production build and the bundler drops the branch, so this path 404s in
 * production exactly like any other unknown address. Never swap it for a runtime
 * check, an env var or a query parameter — all three would make it real.
 */
export const Route = createFileRoute("/errors/$code")({
	component: ErrorPreview,
});

function ErrorPreview() {
	const { code } = Route.useParams();

	if (!import.meta.env.DEV) throw notFound();

	if (code === "500") {
		return (
			<AppErrorPage
				error={new Error("Preview only. No error was actually thrown.")}
				reset={() => window.location.reload()}
			/>
		);
	}
	if (code === "503") return <MaintenancePage />;
	return <NotFoundPage />;
}
