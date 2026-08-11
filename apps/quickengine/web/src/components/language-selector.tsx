import { CaretDown, Globe } from "@phosphor-icons/react";
import { useState } from "react";

// ⚠️ This list is a STATEMENT OF INTENT, not a capability. No i18n is wired, so
// choosing one changes the label and nothing else. Every language named here is
// a promise to translate the site into it — shorten the list rather than ship a
// selector that silently does nothing in fourteen languages.
const LANGUAGES = [
	{ code: "EN", label: "English" },
	{ code: "ES", label: "Español" },
	{ code: "FR", label: "Français" },
	{ code: "DE", label: "Deutsch" },
	{ code: "IT", label: "Italiano" },
	{ code: "PT", label: "Português" },
	{ code: "NL", label: "Nederlands" },
	{ code: "PL", label: "Polski" },
	{ code: "SV", label: "Svenska" },
	{ code: "TR", label: "Türkçe" },
	{ code: "RU", label: "Русский" },
	{ code: "AR", label: "العربية" },
	{ code: "HI", label: "हिन्दी" },
	{ code: "ZH", label: "中文" },
	{ code: "JA", label: "日本語" },
	{ code: "KO", label: "한국어" },
];

// Locale control. Lives in the footer, so the menu opens upward. Selection is
// local state for now — no i18n is wired yet.
export function LanguageSelector({ className }: { className?: string }) {
	const [open, setOpen] = useState(false);
	const [lang, setLang] = useState("EN");

	return (
		<div className="relative">
			<button
				type="button"
				aria-label="Select language"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className={`flex items-center gap-1.5 font-normal text-[13px] text-muted-foreground transition-colors hover:text-foreground ${className ?? ""}`}
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
					{/* Capped and scrollable: sixteen entries opening upward would run
					    off the top of the viewport from a footer. */}
					<div className="absolute right-0 bottom-[calc(100%+0.75rem)] z-50 max-h-72 w-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
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
