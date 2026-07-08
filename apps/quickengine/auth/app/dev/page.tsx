"use client";

import {
	emailOtp,
	passkey,
	requestPasswordReset,
	resetPassword,
	sendVerificationEmail,
	signIn,
	signOut,
	signUp,
	useSession,
} from "@quickengine/auth/client";
import { clientEnv } from "@quickengine/env/client";
import { Button } from "@quickengine/ui/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@quickengine/ui/components/ui/card";
import { Input } from "@quickengine/ui/components/ui/input";
import { Label } from "@quickengine/ui/components/ui/label";
import { useState } from "react";

// Functional test surface for every auth flow, built from the shared shadcn UI.
// Not the real product UI — that comes later.
export default function DevAuthConsole() {
	const { data: session, isPending, refetch } = useSession();
	const [name, setName] = useState("QuickEngine");
	const [email, setEmail] = useState("quickenginesw@gmail.com");
	const [password, setPassword] = useState("QuickEngine123!");
	const [token, setToken] = useState("");
	const [log, setLog] = useState("");

	const origin = clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL;

	const run = async (label: string, fn: () => Promise<unknown>) => {
		setLog(`${label}: running…`);
		try {
			const res = await fn();
			setLog(`${label}:\n${JSON.stringify(res, null, 2)}`);
			refetch?.();
		} catch (error) {
			setLog(
				`${label} ERROR: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return (
		<main className="min-h-dvh bg-background text-foreground">
			<div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
				<div>
					<h1 className="font-semibold text-xl tracking-tight">
						QuickEngine Auth · dev console
					</h1>
					<p className="text-muted-foreground text-sm">
						Functional test surface for every auth flow. Fill the fields, click
						an action, watch the result.
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
							Session
						</CardTitle>
					</CardHeader>
					<CardContent className="text-sm">
						{isPending ? (
							<span className="text-muted-foreground">loading…</span>
						) : session ? (
							<span className="text-emerald-500">
								Signed in · {session.user.email} · verified:{" "}
								{String(session.user.emailVerified)}
							</span>
						) : (
							<span className="text-muted-foreground">Signed out</span>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardContent className="grid gap-4">
						<div className="grid gap-1.5">
							<Label htmlFor="dev-name">Name</Label>
							<Input
								id="dev-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="dev-email">Email</Label>
							<Input
								id="dev-email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="dev-password">Password</Label>
							<Input
								id="dev-password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="dev-token">Reset token / OTP code</Label>
							<Input
								id="dev-token"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="reset token from email, or the OTP code"
							/>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
							Actions
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						<Button
							onClick={() =>
								run("sign-up", () =>
									signUp.email({
										name,
										email,
										password,
										callbackURL: `${origin}/verify-email`,
									}),
								)
							}
						>
							Sign up
						</Button>
						<Button
							onClick={() =>
								run("sign-in", () => signIn.email({ email, password }))
							}
						>
							Sign in
						</Button>
						<Button
							variant="outline"
							onClick={() => run("sign-out", () => signOut())}
						>
							Sign out
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("resend-verify", () =>
									sendVerificationEmail({
										email,
										callbackURL: `${origin}/verify-email`,
									}),
								)
							}
						>
							Resend verify
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("forgot-pw", () =>
									requestPasswordReset({
										email,
										redirectTo: `${origin}/reset-password`,
									}),
								)
							}
						>
							Send reset email
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("reset-pw", () =>
									resetPassword({ newPassword: password, token }),
								)
							}
						>
							Reset password
						</Button>
						<Button
							variant="outline"
							onClick={() =>
								run("google", () =>
									signIn.social({
										provider: "google",
										callbackURL: `${origin}/dev`,
									}),
								)
							}
						>
							Google
						</Button>
						<Button
							variant="outline"
							onClick={() =>
								run("github", () =>
									signIn.social({
										provider: "github",
										callbackURL: `${origin}/dev`,
									}),
								)
							}
						>
							GitHub
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("otp-send", () =>
									emailOtp.sendVerificationOtp({ email, type: "sign-in" }),
								)
							}
						>
							Send sign-in OTP
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("otp-verify", () => signIn.emailOtp({ email, otp: token }))
							}
						>
							Verify OTP (uses token field)
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("magic-link", () =>
									signIn.magicLink({ email, callbackURL: `${origin}/dev` }),
								)
							}
						>
							Send magic link
						</Button>
						<Button
							variant="secondary"
							onClick={() =>
								run("passkey-register", () =>
									passkey.addPasskey({ name: `${email} · dev` }),
								)
							}
						>
							Register passkey (needs session)
						</Button>
						<Button
							variant="secondary"
							onClick={() => run("passkey-signin", () => signIn.passkey())}
						>
							Sign in with passkey
						</Button>
						<Button
							variant="outline"
							onClick={() =>
								run("passkey-list", () => passkey.listUserPasskeys())
							}
						>
							List passkeys
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
							Result
						</CardTitle>
					</CardHeader>
					<CardContent>
						<pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
							{log || "—"}
						</pre>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
