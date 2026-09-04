import {
	CaretUpDownIcon,
	CheckIcon,
	CopyIcon,
	type Icon,
	MinusIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { SaveLabel } from "../save-button";

/**
 * The console's own dropdown and number field.
 *
 * 🔴 NO OPERATING SYSTEM UI. A native `<select>` is drawn by the OS: it takes
 * the system accent, ignores the theme, and looks like a different application
 * embedded in this one. Same for a number input's spinner arrows, which are
 * three pixels wide and unusable on a trackpad.
 *
 * ⚠️ The real `<select>` is not merely restyled — it is replaced. A popover of
 * buttons is the only way to control the panel's colour, and keyboard and
 * screen-reader support comes from the popover primitive rather than being
 * reinvented.
 */

const TRIGGER =
	"flex h-8 w-[15rem] max-w-full items-center justify-between gap-2 field rounded-md px-2.5 text-[12px] text-[var(--ink-85)] outline-none transition-colors hover:border-[rgb(var(--console-ink)/0.25)] data-[state=open]:border-[rgb(var(--console-ink)/0.25)]";

export function Choice({
	value,
	options,
	onChange,
	label,
	/** Long lists get a filter. Three options do not need one. */
	searchable = false,
	placeholder = "Choose",
}: {
	value: string;
	options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
	onChange: (value: string) => void;
	label: string;
	searchable?: boolean;
	placeholder?: string;
}) {
	const [open, setOpen] = useState(false);
	const [find, setFind] = useState("");
	const current = options.find((option) => option.value === value);
	const needle = find.trim().toLowerCase();
	const shown = needle
		? options.filter((option) =>
				`${option.label} ${option.value} ${option.hint ?? ""}`
					.toLowerCase()
					.includes(needle),
			)
		: options;

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setFind("");
			}}
		>
			<PopoverTrigger aria-label={label} className={TRIGGER}>
				<span className="min-w-0 truncate">
					{current ? current.label : value || placeholder}
				</span>
				<CaretUpDownIcon
					size={12}
					aria-hidden="true"
					className="shrink-0 text-[var(--ink-35)]"
				/>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-[15rem] rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1"
			>
				{searchable ? (
					<input
						/* 🔑 Focus follows the popover opening, which is the one case
						   autofocus is right: the person deliberately opened a search
						   box, and making them click it again is the bug. Set through a
						   ref callback because the lint rule is about focus stolen on
						   PAGE load, which this is not. */
						ref={(node) => node?.focus()}
						value={find}
						onChange={(event) => setFind(event.target.value)}
						placeholder="Search"
						className="mb-1 h-8 w-full field rounded-md px-2.5 text-[12px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
					/>
				) : null}
				<div className="max-h-64 overflow-y-auto">
					{shown.length === 0 ? (
						<p className="px-2 py-2 text-[11.5px] text-[var(--ink-30)]">
							Nothing matches.
						</p>
					) : null}
					{shown.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => {
								onChange(option.value);
								setOpen(false);
							}}
							className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-[var(--ink-70)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)]"
						>
							<span className="min-w-0 flex-1 truncate">{option.label}</span>
							{option.hint ? (
								<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
									{option.hint}
								</span>
							) : null}
							{option.value === value ? (
								<CheckIcon size={12} className="shrink-0" />
							) : null}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

const STEP =
	"flex size-7 shrink-0 items-center justify-center text-[var(--ink-45)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-30";

/**
 * A number, with our own increment controls.
 *
 * ⚠️ `[appearance:textfield]` and the webkit rules remove the OS spinner. They
 * have to be there even though the buttons exist — otherwise both appear, and
 * the native pair is the one that looks wrong.
 */
export function Stepper({
	value,
	onChange,
	label,
	min,
	max,
	step = 1,
	suffix,
	placeholder,
}: {
	value: number | null;
	onChange: (value: number | null) => void;
	label: string;
	min?: number;
	max?: number;
	step?: number;
	suffix?: string;
	placeholder?: string;
}) {
	const clamp = (next: number) =>
		Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min ?? 0, next));

	return (
		<div className="flex h-8 w-[15rem] max-w-full items-center rounded-md border border-[var(--console-line-strong)] transition-colors focus-within:border-[rgb(var(--console-ink)/0.25)]">
			<button
				type="button"
				aria-label={`${label}: less`}
				className={STEP}
				disabled={value !== null && min !== undefined && value <= min}
				onClick={() => onChange(clamp((value ?? 0) - step))}
			>
				<MinusIcon size={12} weight="bold" />
			</button>
			<input
				type="number"
				inputMode="decimal"
				aria-label={label}
				value={value === null ? "" : value}
				min={min}
				max={max}
				step={step}
				placeholder={placeholder}
				onChange={(event) =>
					onChange(
						event.target.value === "" ? null : Number(event.target.value),
					)
				}
				className="min-w-0 flex-1 bg-transparent text-center text-[12px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			/>
			{suffix ? (
				<span className="shrink-0 pr-1 text-[11px] text-[var(--ink-30)]">
					{suffix}
				</span>
			) : null}
			<button
				type="button"
				aria-label={`${label}: more`}
				className={STEP}
				disabled={value !== null && max !== undefined && value >= max}
				onClick={() => onChange(clamp((value ?? 0) + step))}
			>
				<PlusIcon size={12} weight="bold" />
			</button>
		</div>
	);
}

/**
 * A titled run of rows.
 *
 * 🔑 A settings page is several of these, not one long list. "Workspace" and
 * "Preferences" are different questions, and a heading between them is what
 * lets somebody skip the half they did not come for.
 */
export function Group({
	title,
	note,
	children,
}: {
	title: string;
	note?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col">
			<h3 className="mb-1 font-medium text-[13px] text-[var(--ink-90)]">
				{title}
			</h3>
			{note ? (
				<p className="mb-2 text-[11.5px] text-[var(--ink-35)] leading-5">
					{note}
				</p>
			) : null}
			<div className="flex flex-col">{children}</div>
		</section>
	);
}

/**
 * One setting: what it is on the left, what it is set to on the right.
 *
 * ⚠️ `items-center` with the control never wrapping. A description that runs to
 * two lines must not push its own control out of line with the rows above it —
 * that is what makes a settings page look thrown together.
 */
export function Row({
	label,
	description,
	children,
}: {
	label: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-6 py-3.5">
			<div className="min-w-0">
				<p className="text-[12.5px] text-[var(--ink-85)]">{label}</p>
				{description ? (
					<p className="mt-0.5 text-[11px] text-[var(--ink-30)] leading-4">
						{description}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 justify-end">{children}</div>
		</div>
	);
}

/**
 * A value you can only read, and copy.
 *
 * 🔑 Workspace and organisation ids belong in settings because that is where
 * people look for them — and they are useless unless they can be copied without
 * selecting a uuid by hand.
 */
export function ReadOnly({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				void navigator.clipboard?.writeText(value);
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1500);
			}}
			data-hint="Copy"
			className="flex h-8 w-[15rem] max-w-full items-center gap-2 rounded-md border border-[var(--console-line)] px-2.5 text-left font-mono text-[11.5px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
		>
			<span className="min-w-0 flex-1 truncate">{value}</span>
			{copied ? (
				<CheckIcon size={12} className="shrink-0" />
			) : (
				<CopyIcon size={12} className="shrink-0 text-[var(--ink-30)]" />
			)}
		</button>
	);
}

/**
 * Two or three exclusive choices, all visible.
 *
 * ⚠️ A segmented control rather than a dropdown when the options are few and
 * worth seeing: light/dark/system is three words, and hiding them behind a
 * popover costs a click to learn what the choices even are.
 */
export function Segments({
	value,
	options,
	onChange,
	label,
}: {
	value: string;
	options: ReadonlyArray<{ value: string; label: string; Icon?: Icon }>;
	onChange: (value: string) => void;
	label: string;
}) {
	return (
		/* A fieldset rather than `role="radiogroup"`: same semantics, and the
		   native element is what assistive technology already understands. */
		<fieldset
			aria-label={label}
			className="flex h-8 shrink-0 items-center rounded-md border border-[var(--console-line-strong)] bg-[rgb(var(--console-ink)/0.04)] p-[3px]"
		>
			{options.map((option) => (
				/* A real radio, hidden, with the pill as its label — so arrow keys
				   move between options and a screen reader announces a group of
				   choices rather than a row of unrelated buttons. */
				<label
					key={option.value}
					className={`flex h-6 cursor-pointer items-center gap-1.5 rounded-[3px] px-2.5 text-[11.5px] transition-colors ${
						option.value === value
							? "bg-[var(--console-pop)] text-[var(--ink-90)] shadow-[0_1px_3px_rgb(0_0_0/0.28)]"
							: "text-[var(--ink-35)] hover:text-[var(--ink-70)]"
					}`}
				>
					<input
						type="radio"
						name={label}
						checked={option.value === value}
						onChange={() => onChange(option.value)}
						className="sr-only"
					/>
					{option.Icon ? <option.Icon size={13} /> : null}
					{option.label}
				</label>
			))}
		</fieldset>
	);
}

/**
 * Where a section's Save button goes: the page header, not the foot of the
 * form.
 *
 * 🔑 Sections vary from two rows to sixteen. A Save at the bottom is in a
 * different place on every page and, on the long ones, below the fold — so you
 * change a switch, look for the button, and cannot see one. Pinned to the
 * header it is always in the same spot and always visible.
 *
 * ⚠️ An ELEMENT in state, not a ref: a portal needs its target to exist before
 * it can render into it, and a ref never re-renders the reader when it fills.
 */
const SaveRailContext = createContext<{
	rail: HTMLElement | null;
	setRail: (element: HTMLElement | null) => void;
}>({ rail: null, setRail: () => {} });

export function SaveRailProvider({ children }: { children: ReactNode }) {
	const [rail, setRail] = useState<HTMLElement | null>(null);
	const value = useMemo(() => ({ rail, setRail }), [rail]);
	return (
		<SaveRailContext.Provider value={value}>
			{children}
		</SaveRailContext.Provider>
	);
}

export function useSaveRail() {
	return useContext(SaveRailContext);
}

/**
 * The Save button itself, rendered into the header when there is one.
 *
 * Falls back to rendering in place, so a form used outside the dialog still
 * has a way to save.
 */
export function SaveButton({
	disabled,
	busy,
	saved,
	onSave,
}: {
	disabled: boolean;
	busy: boolean;
	saved: boolean;
	onSave: () => void;
}) {
	const { rail } = useSaveRail();
	const button = (
		<div className="flex items-center gap-2.5">
			{/* The word "Saved" used to sit BESIDE the button, which meant the row
			    changed width the moment anything saved and pushed the button
			    sideways. The tick lives on the button now, in the same cell as the
			    label, so nothing moves. */}
			<button
				type="button"
				disabled={disabled || busy}
				onClick={onSave}
				/* 🔑 A HEADER BUTTON, not an ink filled primary.
				   `--console-ink` is off white in dark, so the filled version read as
				   a bright slab that matched nothing else on the surface it sits on.
				   The console's raised control is the shared language here: the card
				   face, the lit edge, the same press. */
				className={`control-raised ${busy ? "shimmer-busy" : ""} flex h-7 shrink-0 items-center rounded-md border border-[var(--console-line)] px-2.5 font-medium text-[11.5px] text-[var(--ink-90)] disabled:opacity-30`}
			>
				<SaveLabel saving={busy} saved={saved}>
					Save
				</SaveLabel>
			</button>
		</div>
	);
	return rail ? createPortal(button, rail) : button;
}
