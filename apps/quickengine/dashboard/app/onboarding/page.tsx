import type { Metadata } from "next";
import { OnboardingFlow } from "./flow";

export const metadata: Metadata = { title: "Get started" };

// Shell-free first-run onboarding (lives outside the (app) group, so no sidebar
// or header — a clean takeover canvas).
export default function Page() {
	return <OnboardingFlow />;
}
