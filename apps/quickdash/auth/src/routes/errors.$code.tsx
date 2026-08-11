import { createFileRoute, notFound } from "@tanstack/react-router";
import { AuthButton, AuthScreen } from "@/components/auth-screen";

/**
 * Dev-only viewer: `/errors/404`, `/errors/500`, `/errors/503`.
 *
 * ⚠️ These render the screens rather than importing them. The root route's
 * `errorComponent` and `notFoundComponent` are not exported and cannot be —
 * TanStack owns how they are mounted. Keeping the copy identical to
 * `routes/__root.tsx` is therefore a manual job; if the wording there changes,
 * change it here.
 *
 * 🔴 Dropped entirely from a production build. See the marketing app's copy of
 * this file for why the guard must stay a build-time constant.
 */
export const Route = createFileRoute("/errors/$code")({
	component: ErrorPreview,
});

function ErrorPreview() {
	const { code } = Route.useParams();

	if (!import.meta.env.DEV) throw notFound();

	if (code === "500") {
		return (
			<AuthScreen
				title="Something went wrong on our end."
				subtitle="This one is ours, not yours. Try again."
				swap={{ label: "Sign In", href: "/signin" }}
				legal={false}
			>
				<AuthButton type="button" onClick={() => window.location.reload()}>
					Try again
				</AuthButton>
			</AuthScreen>
		);
	}
	if (code === "503") {
		return (
			<AuthScreen
				title="Back in a few minutes."
				subtitle="We're making a change that needs everything briefly offline. Your account is untouched."
				home
				legal={false}
			>
				<AuthButton href="https://quickdash.statuspage.io">
					Live status
				</AuthButton>
			</AuthScreen>
		);
	}
	return (
		<AuthScreen
			title="That page isn't here."
			subtitle="The link may be old, or the page may not be built yet."
			swap={{ label: "Sign In", href: "/signin" }}
			legal={false}
		>
			<AuthButton href="/signin">Go to sign in</AuthButton>
		</AuthScreen>
	);
}
