import { StatusScreen, textLink } from "@quickengine/ui";

// 404 — same StatusScreen as auth + dashboard; only the link target differs.
export default function NotFound() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist. Head back home to continue."
			action={
				<a href="/" className={textLink}>
					Back home
				</a>
			}
		/>
	);
}
