import { StatusScreen, textLink } from "./_auth-ui";

// 404 — Next serves this for unmatched routes and notFound().
export default function NotFound() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist. Head back to sign in to continue."
			action={
				<a href="/signin" className={textLink}>
					Back to sign in
				</a>
			}
		/>
	);
}
