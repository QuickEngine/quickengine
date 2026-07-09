import { faGithub, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";
import type { ReactNode } from "react";

// Shared styling + icons for the auth screens (flat, on-brand — matches web).
export const field =
	"h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-white/25 focus:bg-white/[0.05]";

export const socialButton =
	"inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-white/25 disabled:opacity-60";

export const primaryButton =
	"inline-flex h-11 items-center justify-center rounded-lg bg-white font-medium text-[14px] text-black outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-60";

export const subtleButton =
	"inline-flex h-11 items-center justify-center gap-2.5 rounded-lg border border-white/10 text-[14px] text-foreground outline-none transition-colors hover:bg-white/[0.04] focus-visible:border-white/25 disabled:opacity-60";

export const textLink =
	"text-[13px] text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground";

export function GoogleIcon() {
	return <FontAwesomeIcon icon={faGoogle} className="h-4 w-4" />;
}

export function GithubIcon() {
	return <FontAwesomeIcon icon={faGithub} className="h-4 w-4" />;
}

// Centered shell with the logo — no marketing chrome; auth is a pure IdP.
export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center px-6 py-16">
			<div className="w-full max-w-sm">
				<div className="mb-10 flex justify-center">
					<Image
						src="/logo.svg"
						alt="QuickEngine"
						width={250}
						height={250}
						priority
						className="h-7 w-7"
					/>
				</div>
				{children}
			</div>
		</main>
	);
}

export function Divider({ label = "or" }: { label?: string }) {
	return (
		<div className="my-6 flex items-center gap-4">
			<span className="h-px flex-1 bg-white/10" />
			<span className="text-[12px] text-muted-foreground">{label}</span>
			<span className="h-px flex-1 bg-white/10" />
		</div>
	);
}
