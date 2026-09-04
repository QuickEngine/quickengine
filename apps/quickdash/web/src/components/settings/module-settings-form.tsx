import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "../../lib/api";
import { CURRENCIES } from "../../lib/currencies";
import { WriteFailure } from "../page-state";
import { Choice, SaveButton, Stepper } from "./controls";
import { type Field, MODULE_SETTINGS } from "./module-fields";

/**
 * One module's settings, as a form.
 *
 * 🔴 The whole object is PUT back, not a patch. `PATCH
 * /v1/quickdash/modules/:id/settings` runs the module's full zod schema over
 * the body, so sending only what changed fails validation on every field it
 * omits. Current values come from `/quickdash/context`, which already carries
 * `settings` per module — no extra request, and no second source of truth.
 *
 * ⚠️ Saved explicitly, not on every keystroke. A prefix typed one character at
 * a time would otherwise write "O", "OR", "ORD" and renumber nothing usefully
 * while failing validation twice on the way.
 */

/** Read `billingRounding.mode` out of a nested settings object. */
export function read(source: Record<string, unknown>, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(value, key) =>
				value && typeof value === "object"
					? (value as Record<string, unknown>)[key]
					: undefined,
			source,
		);
}

/** Write it back, creating the branch if the module has never been saved. */
export function write(
	source: Record<string, unknown>,
	path: string,
	next: unknown,
): Record<string, unknown> {
	const keys = path.split(".");
	const copy = { ...source };
	let level = copy;
	for (const key of keys.slice(0, -1)) {
		const existing = level[key];
		const branch =
			existing && typeof existing === "object"
				? { ...(existing as Record<string, unknown>) }
				: {};
		level[key] = branch;
		level = branch;
	}
	level[keys[keys.length - 1]] = next;
	return copy;
}

/** The control column. Fixed so every row's right edge lines up. */
const INPUT =
	"h-8 w-[15rem] max-w-full field rounded-md px-2.5 text-[12px] text-[var(--ink-85)] outline-none transition-colors";

export function ModuleSettingsForm({
	workspaceId,
	moduleId,
	moduleName,
	settings,
}: {
	workspaceId: string;
	moduleId: string;
	moduleName: string;
	/** This module's saved settings, straight off the workspace context. */
	settings: Record<string, unknown>;
}) {
	const spec = MODULE_SETTINGS[moduleId];
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<Record<string, unknown>>(settings);
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [saved, setSaved] = useState(false);

	// 🔴 Re-seed when the module changes. Without this, switching sections in the
	// dialog would carry the previous module's values into the next form and
	// then save them onto it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-seed per module, not per settings identity
	useEffect(() => {
		setDraft(settings);
		setFailure(null);
		setSaved(false);
	}, [moduleId]);

	const save = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request(
				`/quickdash/modules/${moduleId}/settings`,
				{ method: "PATCH", body: draft },
			);
		},
		onMutate: () => {
			setFailure(null);
			setSaved(false);
		},
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "Those settings did not save." }),
		onSuccess: async () => {
			setSaved(true);
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "context"],
			});
		},
	});

	if (!spec) {
		return (
			<p className="text-[12px] text-[var(--ink-35)]">
				{moduleName} has nothing to configure yet.
			</p>
		);
	}

	const set = (path: string, value: unknown) => {
		setDraft((current) => write(current, path, value));
		setSaved(false);
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				{spec.blurb}
			</p>

			<div className="flex flex-col gap-3.5">
				{spec.fields.map((field) => (
					<FieldRow
						key={field.path}
						field={field}
						value={read(draft, field.path)}
						onChange={(value) => set(field.path, value)}
					/>
				))}
			</div>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<SaveButton
				disabled={false}
				busy={save.isPending}
				saved={saved}
				onSave={() => save.mutate()}
			/>
		</div>
	);
}

export function FieldRow({
	field,
	value,
	onChange,
}: {
	field: Field;
	value: unknown;
	onChange: (value: unknown) => void;
}) {
	/**
	 * 🔑 A ROW, not a stacked label and box.
	 *
	 * What it is on the left, what it is set to on the right, a hairline
	 * between. Stacked fields make a settings page a wall of boxes you have to
	 * read top to bottom; a row is scannable — the eye runs down the left for
	 * the thing it wants and only then crosses to the control.
	 *
	 * ⚠️ The control column is fixed. Ragged right edges are what made the old
	 * page look unfinished, and a select that grows to its longest option puts
	 * every neighbouring control somewhere different.
	 */
	const control = (() => {
		if (field.kind === "toggle") {
			const on = value === true;
			return (
				<button
					type="button"
					role="switch"
					aria-checked={on}
					aria-label={field.label}
					onClick={() => onChange(!on)}
					className={`relative flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
						on
							? "bg-[rgb(var(--console-ink))]"
							: "bg-[rgb(var(--console-ink)/0.14)]"
					}`}
				>
					<span
						aria-hidden="true"
						className={`size-4 rounded-full bg-[var(--console-pop)] shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform ${
							on ? "translate-x-4" : "translate-x-0"
						}`}
					/>
				</button>
			);
		}
		if (field.kind === "select") {
			return (
				<Choice
					label={field.label}
					value={typeof value === "string" ? value : ""}
					options={field.options}
					onChange={onChange}
				/>
			);
		}
		if (field.kind === "currency") {
			/* 🔴 Picked, never typed. "USB" passes a three-letter check and then
			   fails at the payment provider — a typo you find when somebody tries
			   to pay. */
			return (
				<Choice
					searchable
					label={field.label}
					placeholder="Choose a currency"
					value={typeof value === "string" ? value : ""}
					options={CURRENCIES.map((currency) => ({
						value: currency.code,
						label: `${currency.code}, ${currency.name}`,
						hint: currency.symbol,
					}))}
					onChange={onChange}
				/>
			);
		}
		if (field.kind === "percent") {
			/* 🔴 Stored as BASIS POINTS, typed as a percentage. 13% is 1300 — money
			   arithmetic stays in integers, and the person types 13. */
			return (
				<Stepper
					label={field.label}
					suffix="%"
					min={0}
					max={100}
					step={0.5}
					value={typeof value === "number" ? value / 100 : 0}
					onChange={(next) => onChange(Math.round((next ?? 0) * 100))}
				/>
			);
		}
		if (field.kind === "money") {
			/* Stored in cents, typed as an amount. Blank means "not set". */
			return (
				<Stepper
					label={field.label}
					min={0}
					step={1}
					placeholder="Not set"
					value={typeof value === "number" ? value / 100 : null}
					onChange={(next) =>
						onChange(next === null ? null : Math.round(next * 100))
					}
				/>
			);
		}
		if (field.kind === "number") {
			return (
				<Stepper
					label={field.label}
					suffix={field.suffix}
					min={field.min}
					max={field.max}
					value={typeof value === "number" ? value : null}
					onChange={(next) => onChange(next ?? 0)}
				/>
			);
		}
		return (
			<input
				type="text"
				maxLength={field.max}
				placeholder={field.placeholder}
				aria-label={field.label}
				value={typeof value === "string" ? value : ""}
				onChange={(event) =>
					onChange(event.target.value === "" ? null : event.target.value)
				}
				className={INPUT}
			/>
		);
	})();

	return (
		<div className="flex items-center justify-between gap-6 py-3.5">
			<div className="min-w-0">
				<p className="text-[12.5px] text-[var(--ink-85)]">{field.label}</p>
				{field.hint ? (
					<p className="mt-0.5 text-[11px] text-[var(--ink-30)] leading-4">
						{field.hint}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 justify-end">{control}</div>
		</div>
	);
}
