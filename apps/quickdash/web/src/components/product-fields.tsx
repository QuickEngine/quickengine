import { useState } from "react";

/**
 * The editable half of a product, separated from its photographs.
 *
 * 🔑 Everything here is a CONTROLLED draft held by the panel, saved on demand
 * rather than per keystroke. A catalog entry is a set of decisions that only
 * make sense together — a price without its pricing model is a rejected
 * request — so it is edited as one form and committed once.
 */

export const CATALOG_ITEM_TYPES = [
	"physical",
	"digital",
	"service",
	"package",
	"rental",
] as const;

export const PRICING_MODELS = [
	"fixed",
	"starting_at",
	"hourly",
	"custom_quote",
	"free",
] as const;

/**
 * 🔴 Mirrors the module's own rule, which the API enforces and will reject on.
 *
 * `fixed`, `starting_at` and `hourly` REQUIRE a price; `custom_quote` and
 * `free` must not carry one. Showing a price box for "free" and then failing
 * the save is a form that lies about what it will accept, so the box goes away
 * instead.
 */
export const wantsPrice = (model: string) =>
	model === "fixed" || model === "starting_at" || model === "hourly";

export type ProductDraft = {
	name: string;
	description: string;
	type: string;
	sku: string;
	pricingModel: string;
	/** Entered in currency, converted at the edge. Empty means "no price". */
	price: string;
	compareAt: string;
	currency: string;
	unitLabel: string;
	weightGrams: string;
	slug: string;
	shortDescription: string;
	tags: string;
	featured: boolean;
};

const field =
	"h-9 w-full field rounded-md px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)]";

const area =
	"w-full field rounded-md px-3 py-2 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)]";

export function Label({ children, hint }: { children: string; hint?: string }) {
	return (
		<p className="mb-1 text-[11px] text-[var(--ink-45)]">
			{children}
			{hint ? <span className="text-[var(--ink-25)]"> · {hint}</span> : null}
		</p>
	);
}

export function Text({
	label,
	hint,
	value,
	onChange,
	placeholder,
	inputMode,
}: {
	label: string;
	hint?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	inputMode?: "decimal" | "text";
}) {
	return (
		<div>
			<Label hint={hint}>{label}</Label>
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				inputMode={inputMode}
				className={field}
			/>
		</div>
	);
}

export function Area({
	label,
	hint,
	value,
	onChange,
	placeholder,
	rows = 4,
}: {
	label: string;
	hint?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
}) {
	return (
		<div>
			<Label hint={hint}>{label}</Label>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				rows={rows}
				className={area}
			/>
		</div>
	);
}

/**
 * A small set of choices as buttons rather than a native select.
 *
 * There are five at most and which one is chosen changes what else the form
 * shows, so hiding them behind a closed dropdown hides the consequence too.
 */
export function Choice({
	label,
	hint,
	options,
	value,
	onChange,
}: {
	label: string;
	hint?: string;
	options: readonly string[];
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div>
			<Label hint={hint}>{label}</Label>
			<div className="flex flex-wrap gap-1">
				{options.map((option) => (
					<button
						key={option}
						type="button"
						onClick={() => onChange(option)}
						className={`h-7 rounded-full px-2.5 text-[11px] transition-colors ${
							value === option
								? "bg-[rgb(var(--console-ink))] text-[var(--console-pop)]"
								: "border border-[var(--console-line-strong)] text-[var(--ink-50)] hover:text-[var(--ink-85)]"
						}`}
					>
						{option.replace(/_/g, " ")}
					</button>
				))}
			</div>
		</div>
	);
}

export function Toggle({
	label,
	hint,
	value,
	onChange,
}: {
	label: string;
	hint?: string;
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!value)}
			className="flex w-full items-center gap-2.5 text-left"
		>
			<span
				className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
					value
						? "bg-[rgb(var(--console-ink))]"
						: "bg-[rgb(var(--console-ink)/0.15)]"
				}`}
			>
				<span
					className={`size-3 rounded-full bg-[var(--console-panel)] transition-transform ${value ? "translate-x-3" : ""}`}
				/>
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-[12.5px] text-[var(--ink-85)]">
					{label}
				</span>
				{hint ? (
					<span className="block text-[11px] text-[var(--ink-30)]">{hint}</span>
				) : null}
			</span>
		</button>
	);
}

/** A collapsible group, so the panel opens on the fields most edits touch. */
export function Section({
	title,
	children,
	open: initiallyOpen = false,
}: {
	title: string;
	children: React.ReactNode;
	open?: boolean;
}) {
	const [open, setOpen] = useState(initiallyOpen);
	return (
		<section className="py-3">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex w-full items-center justify-between text-left"
			>
				<span className="text-[11px] text-[var(--ink-45)] uppercase tracking-[0.1em]">
					{title}
				</span>
				<span className="text-[11px] text-[var(--ink-25)]">
					{open ? "Hide" : "Show"}
				</span>
			</button>
			{open ? <div className="mt-3 space-y-3">{children}</div> : null}
		</section>
	);
}
