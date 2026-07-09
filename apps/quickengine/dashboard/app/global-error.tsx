"use client";

import { GlobalErrorScreen } from "@quickengine/ui";

export default function GlobalError({ reset }: { reset: () => void }) {
	return <GlobalErrorScreen reset={reset} />;
}
