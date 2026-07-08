import { Suspense } from "react";
import { AuthPanel } from "@/components/auth-panel";

export default function Page() {
	return (
		<Suspense>
			<AuthPanel mode="sign-in" />
		</Suspense>
	);
}
