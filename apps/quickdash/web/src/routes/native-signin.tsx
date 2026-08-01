import { Button } from "@quickengine/ui/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { clientEnv } from "../lib/env";
import { isNativeShell, startNativeSignIn } from "../lib/native-auth";

/**
 * Sign-in for the native shell only.
 *
 * The browser never lands here — it goes to `auth.quickdash.xyz`, which is the
 * real sign-in surface with passkeys, email and everything else. This screen
 * exists because the desktop app cannot use it: Google degrades and can block
 * OAuth inside an embedded webview, so the shell has to hand off to the system
 * browser instead. See `native-auth.ts`.
 *
 * Social only, deliberately. A password or OTP form typed inside the shell would
 * work, but it would put credentials in a window that is not the browser the
 * user recognises — the opposite of what the handoff is for.
 */
export const Route = createFileRoute("/native-signin")({
	component: NativeSignIn,
});

function NativeSignIn() {
	const [waiting, setWaiting] = useState<"google" | "github" | null>(null);

	// Outside the shell there is nothing to hand off to. Anyone who reaches this
	// URL in a browser is sent to the real sign-in rather than shown a dead page.
	if (!isNativeShell()) {
		window.location.replace(`${clientEnv.AUTH_URL}/signin`);
		return null;
	}

	const start = (provider: "google" | "github") => {
		setWaiting(provider);
		startNativeSignIn(clientEnv.AUTH_URL, provider).catch(() =>
			setWaiting(null),
		);
	};

	return (
		<div className="flex h-svh items-center justify-center px-6">
			<div className="w-full max-w-72 space-y-6">
				<div className="space-y-1.5">
					<h1 className="font-display text-lg text-ink">
						Sign in to QuickDash
					</h1>
					<p className="text-[13px] text-dim leading-relaxed">
						{waiting
							? "Finish signing in in your browser. This window updates on its own."
							: "Your browser opens to complete sign-in, then hands you back here."}
					</p>
				</div>

				{/* 4px between the two, per the spacing rule — controls never sit flush. */}
				<div className="flex flex-col gap-1">
					<Button
						variant="secondary"
						disabled={waiting !== null}
						onClick={() => start("google")}
					>
						Continue with Google
					</Button>
					<Button
						variant="secondary"
						disabled={waiting !== null}
						onClick={() => start("github")}
					>
						Continue with GitHub
					</Button>
				</div>
			</div>
		</div>
	);
}
