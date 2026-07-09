"use client";

import { primaryButton, StatusScreen } from "./_auth-ui";

// Segment error boundary — catches unexpected runtime errors (a 500-class
// failure) and offers a retry without a full reload.
export default function ErrorBoundary({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<StatusScreen
			code="500"
			title="Something went wrong"
			message="An unexpected error occurred on our end. Try again in a moment."
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
