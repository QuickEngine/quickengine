import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "../../lib/api";
import { SaveButton } from "./controls";
import { FieldRow, read, write } from "./module-settings-form";
import { WORKSPACE_SETTINGS } from "./workspace-fields";

/**
 * One group of workspace settings, as a form.
 *
 * 🔑 The same shape as the module form, against a different endpoint. Both read
 * a saved object, edit by path and write the whole GROUP back — the API parses
 * that group's schema, so a partial body fails on every field it omits.
 *
 * ⚠️ One query for all ten groups, not one per section. It is a single row in
 * the database, and fetching it per section would make opening the dialog and
 * clicking down the list ten requests for the same object.
 */
export function WorkspaceSettingsForm({
	workspaceId,
	section,
}: {
	workspaceId: string;
	/** The dialog section id, e.g. "checkout" or "email". */
	section: string;
}) {
	const spec = WORKSPACE_SETTINGS[section];
	const queryClient = useQueryClient();
	/** Draft per GROUP, because that is what a save writes. */
	const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>(
		{},
	);
	const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
	const [failure, setFailure] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const settings = useQuery({
		queryKey: ["quickdash", workspaceId, "settings"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<Record<string, unknown>>(
					"/quickdash/settings",
				)
			).data,
	});

	// 🔴 Re-seed on the SECTION as well as the data. Without the section here,
	// moving from Checkout to Returns would keep checkout's values in the draft
	// and then save them onto returns.
	// biome-ignore lint/correctness/useExhaustiveDependencies: seed per section and per fetch
	useEffect(() => {
		if (!spec || !settings.data) return;
		const seeded: Record<string, Record<string, unknown>> = {};
		for (const block of spec.blocks) {
			seeded[block.group] = (settings.data[block.group] ?? {}) as Record<
				string,
				unknown
			>;
		}
		setDraft(seeded);
		setDirty(new Set());
		setFailure(null);
		setSaved(false);
	}, [section, settings.data]);

	const save = useMutation({
		mutationFn: async () => {
			/**
			 * ⚠️ Only the groups that CHANGED, one request each.
			 *
			 * A page can span several groups and the API replaces a whole group per
			 * call. Writing all of them every time would mean a page that failed
			 * validation on one group still rewrote the others.
			 */
			for (const group of dirty) {
				await workspaceApi(workspaceId).request(
					`/quickdash/settings/${group}`,
					{ method: "PATCH", body: draft[group] ?? {} },
				);
			}
		},
		onMutate: () => {
			setFailure(null);
			setSaved(false);
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "Those settings did not save."),
		onSuccess: async () => {
			setSaved(true);
			setDirty(new Set());
			await queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "settings"],
			});
		},
	});

	if (!spec) return null;
	if (settings.isPending) {
		return <p className="text-[12px] text-[var(--ink-30)]">Loading…</p>;
	}
	if (settings.isError) {
		return (
			<p className="text-[11.5px] text-[#ff6b6b] leading-5">
				These settings could not be loaded.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			{spec.blurb ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					{spec.blurb}
				</p>
			) : null}

			{spec.blocks.map((block) => (
				<div key={block.group} className="flex flex-col gap-3.5">
					{block.title ? (
						<p className="text-[12px] text-[var(--ink-70)]">{block.title}</p>
					) : null}
					{block.blurb ? (
						<p className="-mt-2 text-[11.5px] text-[var(--ink-35)] leading-5">
							{block.blurb}
						</p>
					) : null}
					{block.fields.map((field) => (
						<FieldRow
							key={`${block.group}.${field.path}`}
							field={field}
							value={read(draft[block.group] ?? {}, field.path)}
							onChange={(value) => {
								setDraft((current) => ({
									...current,
									[block.group]: write(
										current[block.group] ?? {},
										field.path,
										value,
									),
								}));
								setDirty((current) => new Set(current).add(block.group));
								setSaved(false);
							}}
						/>
					))}
				</div>
			))}

			{failure ? (
				<p className="text-[11.5px] text-[#ff6b6b] leading-5">{failure}</p>
			) : null}

			<SaveButton
				disabled={dirty.size === 0}
				busy={save.isPending}
				saved={saved}
				onSave={() => save.mutate()}
			/>
		</div>
	);
}
