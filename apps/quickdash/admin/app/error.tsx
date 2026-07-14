"use client";

import { primaryButton, StatusScreen } from "@quickengine/ui";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
	return (
		<StatusScreen
			code="500"
			title="Something went wrong"
			message="QuickDash could not load this workspace. Try again in a moment."
			action={
				<button
					type="button"
					onClick={reset}
					className={`${primaryButton} w-full`}
				>
					Try again
				</button>
			}
		/>
	);
}
