"use client";

import { CaretDown, Globe } from "@phosphor-icons/react";
import { useState } from "react";

const LANGUAGES = [
	{ code: "EN", label: "English" },
	{ code: "ES", label: "Español" },
	{ code: "FR", label: "Français" },
	{ code: "DE", label: "Deutsch" },
];

// Locale control. Lives in the footer, so the menu opens upward. Selection is
// local state for now — no i18n is wired yet.
export function LanguageSelector() {
	const [open, setOpen] = useState(false);
	const [lang, setLang] = useState("EN");

	return (
		<div className="relative">
			<button
				type="button"
				aria-label="Select language"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className="flex items-center gap-1.5 font-normal text-[13px] text-muted-foreground transition-colors hover:text-foreground"
			>
				<Globe className="size-4" />
				{lang}
				<CaretDown className="size-3 opacity-60" />
			</button>

			{open ? (
				<>
					<button
						type="button"
						aria-label="Close language menu"
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-40 cursor-default"
					/>
					<div className="absolute right-0 bottom-[calc(100%+0.75rem)] z-50 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
						{LANGUAGES.map((l) => (
							<button
								key={l.code}
								type="button"
								onClick={() => {
									setLang(l.code);
									setOpen(false);
								}}
								className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-white/5"
							>
								{l.label}
								<span className="text-[11px] text-muted-foreground">
									{l.code}
								</span>
							</button>
						))}
					</div>
				</>
			) : null}
		</div>
	);
}
