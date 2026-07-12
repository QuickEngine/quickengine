import { StatusScreen, textLink } from "@quickengine/ui";

// 404 — same StatusScreen as auth + web; only the link target differs.
export default function NotFound() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist. Head back to your dashboard."
			action={
				<a href="/" className={textLink}>
					Back to dashboard
				</a>
			}
		/>
	);
}
