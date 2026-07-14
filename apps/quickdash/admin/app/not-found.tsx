import { StatusScreen, textLink } from "@quickengine/ui";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

export default function NotFound() {
	return (
		<StatusScreen
			code="404"
			title="Workspace unavailable"
			message="This workspace does not exist, is archived, or you do not have access."
			action={
				<a href={ACCOUNT_URL} className={textLink}>
					Back to QuickEngine
				</a>
			}
		/>
	);
}
