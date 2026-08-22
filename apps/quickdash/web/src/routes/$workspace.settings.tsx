import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sessionApi, workspaceApi } from "../lib/api";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

type TemplateCopy = {
	subject?: string | null;
	/** The whole email, as HTML. Null means the built-in one. */
	html?: string | null;
};

type EmailTemplate = {
	key: string;
	name: string;
	sentWhen: string;
	rendered: { subject: string; html: string; text: string };
	/** The built-in email, to start editing from and to reset back to. */
	defaultHtml: string;
	tokens: readonly string[];
	copy: TemplateCopy;
};

type BrandingFields = {
	workspaceName: string;
	displayName?: string | null;
	supportEmail?: string | null;
	senderEmail?: string | null;
	websiteUrl?: string | null;
	tagline?: string | null;
	accentColor?: string | null;
};

/**
 * Workspace settings.
 *
 * 🔑 Only what QuickDash owns lives here. Anything Account owns — people,
 * billing, deleting the workspace — is a deep link, because two places to change
 * one setting is two places to disagree about it.
 */

const _primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] disabled:pointer-events-none disabled:opacity-40";

function SettingsPage() {
	const { workspaceId: workspace } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspace));
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<string | null>(null);
	const [environmentFailure, setEnvironmentFailure] = useState(false);
	const [saved, setSaved] = useState(false);

	const current = context.data?.workspace;
	const organizationId = current?.organizationId ?? "";
	const sandbox = current?.environment === "test";

	const branding = useQuery({
		queryKey: ["quickdash", workspace, "branding"],
		queryFn: async () =>
			(
				await workspaceApi(workspace).request<BrandingFields>(
					"/quickdash/branding",
				)
			).data,
	});

	const [brand, setBrand] = useState<BrandingFields | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: seed the form once the record arrives
	useEffect(() => {
		if (branding.data && !brand) setBrand(branding.data);
	}, [branding.data]);

	const saveBrand = useMutation({
		mutationFn: async () => {
			if (!brand) return;
			await workspaceApi(workspace).request("/quickdash/branding", {
				method: "PATCH",
				body: {
					displayName: brand.displayName ?? null,
					supportEmail: brand.supportEmail ?? null,
					senderEmail: brand.senderEmail ?? null,
					websiteUrl: brand.websiteUrl ?? null,
					tagline: brand.tagline ?? null,
					accentColor: brand.accentColor || null,
				},
			});
		},
		onSuccess: () => {
			setFailure(null);
			// 🔑 Says so, then stops saying so. A save with no acknowledgement reads
			// as a save that did not happen, and the next thing somebody does is
			// press the button again.
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspace, "branding"],
			});
		},
		onError: (error: { message?: string }) => {
			setEnvironmentFailure(false);
			setFailure(error?.message ?? "That could not be saved.");
		},
	});

	const templates = useQuery({
		queryKey: ["quickdash", workspace, "email-templates"],
		queryFn: async () =>
			(
				await workspaceApi(workspace).request<{
					sender: string | null;
					items: EmailTemplate[];
				}>("/quickdash/email-templates")
			).data,
	});

	const [openTemplate, setOpenTemplate] = useState<string | null>(null);
	/** Edits in progress, by template key. Absent means "showing what is saved". */
	const [drafts, setDrafts] = useState<Record<string, TemplateCopy>>({});

	const saveCopy = useMutation({
		mutationFn: async (key: string) => {
			await workspaceApi(workspace).request(
				`/quickdash/email-templates/${key}`,
				{
					method: "PATCH",
					body: {
						subject: drafts[key]?.subject ?? null,
						html: drafts[key]?.html ?? null,
					},
				},
			);
		},
		onSuccess: (_result, key) => {
			setFailure(null);
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
			setDrafts((was) => {
				const next = { ...was };
				delete next[key];
				return next;
			});
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspace, "email-templates"],
			});
		},
		onError: (error: { message?: string }) => {
			setEnvironmentFailure(false);
			setFailure(error?.message ?? "That wording could not be saved.");
		},
	});
	const [sentTo, setSentTo] = useState<string | null>(null);

	const sendTest = useMutation({
		mutationFn: async (key: string) =>
			(
				await workspaceApi(workspace).request<{ sentTo: string }>(
					`/quickdash/email-templates/${key}/test`,
					{ method: "POST", body: {} },
				)
			).data,
		onSuccess: (result) => {
			setFailure(null);
			setSentTo(result.sentTo);
			setTimeout(() => setSentTo(null), 4000);
		},
		// 🔴 Shown verbatim. This is the ONE place an unverified sending domain
		// is supposed to surface — every other path hides it so a customer still
		// gets their mail, so if it does not appear here it appears nowhere.
		onError: (error: { message?: string }) => {
			setEnvironmentFailure(false);
			setFailure(error?.message ?? "That test could not be sent.");
		},
	});

	const setEnvironment = useMutation({
		mutationFn: async (environment: "test" | "live") =>
			sessionApi.request(
				`/account/workspaces/${workspace}/environment?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "PATCH", body: { environment } },
			),
		onSuccess: () => {
			setFailure(null);
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspace, "context"],
			});
		},
		// 🔴 The refusal is the interesting case, and its message is the rule:
		// the environment locks once the workspace has a payment account, an order
		// or a payment. Showing it verbatim teaches that; a generic failure does
		// not.
		onError: (error: { message?: string }) => {
			setEnvironmentFailure(true);
			setFailure(
				error?.message ??
					"That could not be changed. This workspace has already taken payments.",
			);
		},
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{failure ? (
				<div className="mb-6 flex max-w-2xl items-start gap-2.5 rounded-lg border border-[#f5a623]/30 bg-[#f5a623]/[0.06] p-3.5">
					<WarningIcon
						size={14}
						className="mt-0.5 shrink-0 text-[#f5b44a]"
						weight="fill"
					/>
					<div>
						<p className="text-[12px] text-[#f5b44a]">{failure}</p>
						{/* 🔴 Only for the environment refusal.
						    This advice used to show for EVERY failure on the page, so a
						    rejected support email told somebody to create a sandbox
						    workspace — advice that has nothing to do with what they were
						    doing and cannot be acted on. */}
						{environmentFailure ? (
							<>
								<p className="mt-1.5 text-[11.5px] text-[var(--ink-40)] leading-5">
									Create a separate sandbox workspace instead — it gets its own
									records, API keys and payment provider, and nothing in it can
									touch this business.
								</p>
								<a
									href={`${clientEnv.ACCOUNT_URL}/workspaces/new`}
									className={`${quietAction} mt-3`}
								>
									New sandbox workspace
								</a>
							</>
						) : null}
					</div>
				</div>
			) : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Environment</p>
			<div className="max-w-2xl border-[var(--console-line-soft)] border-t py-4">
				<div className="flex flex-wrap items-center gap-4">
					<div className="min-w-0 flex-1">
						<p className="text-[12.5px] text-[var(--ink-85)]">
							{sandbox ? "Sandbox" : "Live"}
						</p>
						<p className="mt-1 text-[11.5px] text-[var(--ink-35)] leading-5">
							{sandbox
								? "Nothing here is real. Payments are not charged, and these records do not belong to your live business."
								: "Real money and real customers. Payments taken here are charged."}
						</p>
					</div>

					{/* One switch, two labelled ends — the same control as the view
					    toggle, because it is the same kind of decision. */}
					<button
						type="button"
						role="switch"
						aria-checked={sandbox}
						aria-label={`Environment: ${sandbox ? "sandbox" : "live"}`}
						disabled={setEnvironment.isPending || !organizationId}
						onClick={() => setEnvironment.mutate(sandbox ? "live" : "test")}
						className="relative flex h-9 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.1)] disabled:opacity-40"
					>
						<span
							aria-hidden="true"
							className={`absolute top-0.5 left-0.5 h-8 w-[4.5rem] rounded-full bg-[var(--console-pop)] shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-out ${
								sandbox ? "translate-x-[4.5rem]" : "translate-x-0"
							}`}
						/>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] transition-colors ${sandbox ? "text-[var(--ink-30)]" : "text-[var(--ink-90)]"}`}
						>
							Live
						</span>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] transition-colors ${sandbox ? "text-[var(--ink-90)]" : "text-[var(--ink-30)]"}`}
						>
							Sandbox
						</span>
					</button>
				</div>

				{/* ⚠️ Stated before it is attempted, not after the refusal. */}
				<p className="mt-4 text-[11px] text-[var(--ink-30)] leading-5">
					The environment locks as soon as a workspace connects a payment
					provider, takes an order, or receives a payment — switching afterwards
					would leave real money in a workspace labelled sandbox. Run parallel
					sandboxes as separate workspaces instead; each has its own records,
					keys and provider.
				</p>
			</div>

			<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
				How your customers see you
			</p>
			<div className="max-w-2xl space-y-4 border-[var(--console-line-soft)] border-t py-4">
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					Used on every email your customers receive, and on your portal. A
					shopper has no relationship with QuickEngine and should never see it.
				</p>

				<BrandField
					label="Business name"
					hint={`shown as the sender and in the header — defaults to ${brand?.workspaceName ?? "your workspace name"}`}
					value={brand?.displayName ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, displayName: value } : was))
					}
					placeholder={brand?.workspaceName ?? "Caffeinate"}
				/>

				{/* 🔴 The one that stops mail arriving from QuickEngine. */}
				<BrandField
					label="Send emails from"
					hint="must be on a domain you have verified with your mail provider, or mail falls back to ours"
					value={brand?.senderEmail ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, senderEmail: value } : was))
					}
					placeholder="orders@yourdomain.com"
				/>

				<BrandField
					label="Replies and support go to"
					hint="shown in the footer of every email"
					value={brand?.supportEmail ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, supportEmail: value } : was))
					}
					placeholder="hello@yourdomain.com"
				/>

				<BrandField
					label="Website"
					value={brand?.websiteUrl ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, websiteUrl: value } : was))
					}
					placeholder="https://yourdomain.com"
				/>

				<BrandField
					label="Tagline"
					hint="optional, shown under your name"
					value={brand?.tagline ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, tagline: value } : was))
					}
					placeholder="Coffee, delivered"
				/>

				<BrandField
					label="Accent colour"
					hint="a six digit hex, used for buttons in email"
					value={brand?.accentColor ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, accentColor: value } : was))
					}
					placeholder="#6B4423"
				/>

				<div className="flex items-center gap-3">
					<button
						type="button"
						disabled={saveBrand.isPending || !brand}
						onClick={() => saveBrand.mutate()}
						className={`${quietAction} ${saveBrand.isPending ? "shimmer-busy" : ""}`}
					>
						{saveBrand.isPending ? "Saving…" : "Save"}
					</button>
					{saved ? (
						<span className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-45)]">
							<CheckIcon size={12} weight="bold" />
							Saved
						</span>
					) : null}
				</div>
			</div>

			<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Emails your customers receive
			</p>
			<div className="max-w-2xl border-[var(--console-line-soft)] border-t">
				<p className="py-4 text-[11.5px] text-[var(--ink-35)] leading-5">
					{templates.data?.sender ? (
						<>
							Sent from{" "}
							<span className="text-[var(--ink-75)]">
								{templates.data.sender}
							</span>
							. Previews use your own branding.
						</>
					) : (
						<>
							No sending address set, so these go out from QuickEngine. Set one
							above and your customers will see you instead.
						</>
					)}
				</p>

				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{(templates.data?.items ?? []).map((template) => (
						<div key={template.key} className="py-3">
							<div className="flex items-center gap-4">
								<button
									type="button"
									className="min-w-0 flex-1 text-left outline-none"
									onClick={() =>
										setOpenTemplate((was) =>
											was === template.key ? null : template.key,
										)
									}
								>
									<p className="text-[12.5px] text-[var(--ink-75)]">
										{template.name}
									</p>
									<p className="mt-0.5 text-[11px] text-[var(--ink-30)] leading-4">
										{template.sentWhen}
									</p>
								</button>
								<button
									type="button"
									className={quietAction}
									disabled={sendTest.isPending}
									onClick={() => sendTest.mutate(template.key)}
								>
									{sendTest.isPending && sendTest.variables === template.key
										? "Sending…"
										: "Send me one"}
								</button>
							</div>

							{openTemplate === template.key ? (
								<div className="mt-3 space-y-3">
									{/* 🔴 Words only. Line items, totals and tracking stay
									    generated — they are facts about an order, not copy, and
									    a business able to edit them could send a receipt that
									    disagrees with what was charged. */}
									<div className="space-y-2 rounded-lg border border-[var(--console-line-soft)] p-3">
										<BrandField
											label="Subject"
											value={
												drafts[template.key]?.subject ??
												template.copy.subject ??
												""
											}
											onChange={(value) =>
												setDrafts((was) => ({
													...was,
													[template.key]: {
														...template.copy,
														...was[template.key],
														subject: value,
													},
												}))
											}
											placeholder={template.rendered.subject}
										/>

										<div>
											<span className="text-[11.5px] text-[var(--ink-60)]">
												HTML
											</span>
											<p className="mt-1 mb-1.5 text-[11px] text-[var(--ink-30)] leading-4">
												The whole email, yours to change — layout, styles, all
												of it. The system fills in{" "}
												<code className="text-[var(--ink-60)]">
													{"{{details}}"}
												</code>{" "}
												with the line items and totals, and{" "}
												{template.tokens.map((token, index) => (
													<span key={token}>
														{index > 0 ? ", " : ""}
														<code className="text-[var(--ink-60)]">{`{{${token}}}`}</code>
													</span>
												))}
												. Those stay ours so a receipt can never disagree with
												what was charged.
											</p>
											{/* 🔴 Monospace and tall. This is code, and an editor
											    that looks like a comment box invites one-liners. */}
											<textarea
												spellCheck={false}
												value={
													drafts[template.key]?.html ??
													template.copy.html ??
													template.defaultHtml
												}
												onChange={(event) =>
													setDrafts((was) => ({
														...was,
														[template.key]: {
															...template.copy,
															...was[template.key],
															html: event.target.value,
														},
													}))
												}
												className="h-72 w-full rounded-lg border border-[var(--console-line)] bg-transparent p-3 font-mono text-[11.5px] text-[var(--ink-85)] leading-5 outline-none transition-colors focus:border-[rgb(var(--console-ink)/0.25)]"
											/>
										</div>

										<div className="flex items-center gap-2">
											<button
												type="button"
												className={quietAction}
												disabled={saveCopy.isPending}
												onClick={() => saveCopy.mutate(template.key)}
											>
												{saveCopy.isPending &&
												saveCopy.variables === template.key
													? "Saving…"
													: "Save"}
											</button>
											{/* ⚠️ Clearing is how you get ours back. Storing an empty
											    override would mean an email with no body. */}
											<button
												type="button"
												className={quietAction}
												disabled={saveCopy.isPending}
												onClick={() => {
													setDrafts((was) => ({
														...was,
														[template.key]: { subject: null, html: null },
													}));
													saveCopy.mutate(template.key);
												}}
											>
												Reset to ours
											</button>
										</div>
									</div>

									<p className="text-[11px] text-[var(--ink-30)]">
										Subject · {template.rendered.subject}
									</p>
									{/* 🔴 Sandboxed and rendered from the REAL template.
									    A preview drawn separately in the console is a second
									    implementation that drifts, and the first person to
									    notice is a customer. */}
									<iframe
										title={`${template.name} preview`}
										srcDoc={template.rendered.html}
										sandbox=""
										className="h-[420px] w-full rounded-lg border border-[var(--console-line-soft)] bg-white"
									/>
								</div>
							) : null}
						</div>
					))}
				</div>

				{sentTo ? (
					<p className="flex items-center gap-1.5 py-3 text-[11.5px] text-[var(--ink-45)]">
						<CheckIcon size={12} weight="bold" />
						Sent to {sentTo}
					</p>
				) : null}
			</div>

			<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Managed in Account
			</p>
			<div className="max-w-2xl divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
				{[
					[
						"Name and modules",
						`/workspaces`,
						"What this workspace is and what it can do.",
					],
					[
						"People and roles",
						"/team",
						"Who can open this workspace, and what they may change.",
					],
					[
						"Billing and usage",
						"/billing",
						"The plan this workspace counts against.",
					],
				].map(([label, path, detail]) => (
					<a
						key={path}
						href={`${clientEnv.ACCOUNT_URL}${path}`}
						className="flex items-center gap-4 py-3 outline-none transition-colors hover:text-[var(--ink-90)]"
					>
						<div className="min-w-0 flex-1">
							<p className="text-[12.5px] text-[var(--ink-75)]">{label}</p>
							<p className="mt-0.5 text-[11px] text-[var(--ink-30)]">
								{detail}
							</p>
						</div>
						<CheckIcon size={12} className="shrink-0 text-transparent" />
					</a>
				))}
			</div>
		</main>
	);
}

/** One labelled input. Matches the console's field shape without importing it. */
function BrandField({
	label,
	hint,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	hint?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}) {
	return (
		<label className="block">
			<span className="text-[11.5px] text-[var(--ink-60)]">{label}</span>
			{hint ? (
				<span className="ml-1.5 text-[11px] text-[var(--ink-30)]">
					· {hint}
				</span>
			) : null}
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="mt-1.5 h-9 w-full rounded-lg border border-[var(--console-line)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors focus:border-[rgb(var(--console-ink)/0.25)]"
			/>
		</label>
	);
}

export const Route = createFileRoute("/$workspace/settings")({
	component: SettingsPage,
});
