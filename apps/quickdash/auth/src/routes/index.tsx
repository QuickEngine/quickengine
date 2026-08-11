import { createFileRoute, redirect } from "@tanstack/react-router";

// The auth app is a pure identity provider — no marketing front page. Anyone
// landing on the root goes straight to sign-in, before anything renders.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({
			to: "/signin",
			search: { redirect: undefined, signedout: undefined, reason: undefined },
		});
	},
});
