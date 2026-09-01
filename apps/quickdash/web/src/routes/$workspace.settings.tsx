import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { ThemeSwitch } from "@quickengine/ui";
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

	/**
	 * Where parcels are sent FROM.
	 *
	 * 🔴 A carrier cannot price a parcel without an origin, so this is the first
	 * thing a live-rate integration needs and the workspace had nowhere to put
	 * it. Until 2026-08-21 no module setting could be written at all.
	 */
	const shippingModule = context.data?.modules?.find(
		(module) => module.id === "shipping",
	);
	const storedOrigin =
		(shippingModule?.settings as { origin?: ShippingOriginFields | null })
			?.origin ?? null;

	const [origin, setOrigin] = useState<ShippingOriginFields | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: seed the form once the workspace arrives
	useEffect(() => {
		if (shippingModule && !origin) setOrigin(storedOrigin ?? blankOrigin());
	}, [shippingModule]);

	/**
	 * Settings that belong to a MODULE rather than to the workspace.
	 *
	 * 🔴 Every module has declared a settings schema since it was written, and the
	 * save route validates against whichever module is named — so the backend has
	 * always supported all of them. Only Shipping ever got a screen, which left
	 * real settings unreachable: the order number prefix, whether stock may go
	 * below zero, and **the sales tax rate**, which defaults to zero and is
	 * applied to every order.
	 *
	 * ⚠️ Written by hand rather than generated from the schema. A generated form
	 * renders `taxRateBasisPoints` as a number box labelled "taxRateBasisPoints",
	 * and the one thing that setting needs is a person explaining that 5% is
	 * typed as 5 and stored as 500.
	 */
	const ordersModule = context.data?.modules?.find(
		(module) => module.id === "orders",
	);
	const inventoryModule = context.data?.modules?.find(
		(module) => module.id === "inventory",
	);

	const [orderRules, setOrderRules] = useState<OrderRuleFields | null>(null);
	const [stockRules, setStockRules] = useState<StockRuleFields | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: seed once the workspace arrives
	useEffect(() => {
		if (ordersModule && !orderRules) {
			const stored = (ordersModule.settings ?? {}) as Record<string, unknown>;
			setOrderRules({
				numberPrefix: String(stored.numberPrefix ?? "ORD"),
				defaultCurrency: String(stored.defaultCurrency ?? "USD"),
				autoConfirm: Boolean(stored.autoConfirm),
				// 🔑 Basis points in the database, PERCENT on screen. Nobody thinks in
				// basis points, and money arithmetic must not think in floats.
				taxPercent: String(Number(stored.taxRateBasisPoints ?? 0) / 100),
			});
		}
		if (inventoryModule && !stockRules) {
			const stored = (inventoryModule.settings ?? {}) as Record<
				string,
				unknown
			>;
			setStockRules({
				defaultLowStockThreshold: String(stored.defaultLowStockThreshold ?? 5),
				allowNegativeStock: Boolean(stored.allowNegativeStock),
			});
		}
	}, [ordersModule, inventoryModule]);

	const saveModule = useMutation({
		mutationFn: async (input: { moduleId: string; settings: unknown }) => {
			await workspaceApi(workspace).request(
				`/quickdash/modules/${input.moduleId}/settings`,
				// ⚠️ WHOLE object. The route replaces rather than merges, so anything
				// not on this screen has to travel with what is, or saving a tax rate
				// silently resets a setting nobody touched.
				{ method: "PATCH", body: input.settings },
			);
		},
		onSuccess: () => {
			setFailure(null);
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspace, "context"],
			});
		},
		onError: (error: { message?: string }) => {
			setEnvironmentFailure(false);
			setFailure(error?.message ?? "That could not be saved.");
		},
	});

	const saveOrigin = useMutation({
		mutationFn: async () => {
			if (!origin) return;
			const filled = originIsFilled(origin);
			await workspaceApi(workspace).request(
				"/quickdash/modules/shipping/settings",
				{
					method: "PATCH",
					// ⚠️ WHOLE object. The route replaces rather than merges, because a
					// partial save cannot express "clear this" — so the settings that
					// are not on this screen have to travel with the ones that are, or
					// saving an address would silently reset them.
					body: {
						...(shippingModule?.settings ?? {}),
						origin: filled
							? {
									...origin,
									line2: origin.line2 || null,
									region: origin.region || null,
									phone: origin.phone || null,
								}
							: null,
					},
				},
			);
		},
		onSuccess: () => {
			setFailure(null);
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspace, "context"],
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

			{/*
			 * 🔴 A per-PERSON preference on a per-WORKSPACE page, and the wording has
			 * to carry that or it is a trap: somebody who switches this while looking
			 * at one workspace would reasonably expect the other to be unaffected.
			 *
			 * It is here anyway because this is where people already come to change
			 * how things look, and the alternative — Account settings — means leaving
			 * QuickDash to change the colour of QuickDash.
			 */}
			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Appearance</p>
			<div className="mb-8 max-w-2xl border-[var(--console-line-soft)] border-t py-4">
				<div className="flex flex-wrap items-center gap-4">
					<div className="min-w-0 flex-1">
						<p className="text-[12.5px] text-[var(--ink-85)]">Theme</p>
						<p className="mt-1 text-[11.5px] text-[var(--ink-35)] leading-5">
							Applies to you everywhere — QuickDash, Account and the sign-in
							screens — on this device and any other you sign in from. System
							follows your operating system.
						</p>
					</div>
					<ThemeSwitch />
				</div>
			</div>

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
					placeholder={brand?.workspaceName ?? "Kestrel Audio"}
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
					placeholder="Sound you can trust"
				/>

				<BrandField
					label="Accent colour"
					hint="a six digit hex, used for buttons in email"
					value={brand?.accentColor ?? ""}
					onChange={(value) =>
						setBrand((was) => (was ? { ...was, accentColor: value } : was))
					}
					placeholder="#2F5D62"
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

			{/*
			 * 🔴 Sales tax lives here, and until now it was unreachable.
			 *
			 * `taxRateBasisPoints` defaults to ZERO and is applied to every order —
			 * so a business selling in a jurisdiction that charges tax collected
			 * none of it, with no screen anywhere to say otherwise. Unremitted tax
			 * comes out of the merchant's own pocket, months later.
			 */}
			{ordersModule ? (
				<>
					<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
						How your orders work
					</p>
					<div className="max-w-2xl space-y-4 border-[var(--console-line-soft)] border-t py-4">
						<BrandField
							label="Sales tax"
							hint="as a percentage — 5 for GST, 13 for HST. Leave at 0 if you do not charge tax"
							value={orderRules?.taxPercent ?? ""}
							onChange={(value) =>
								setOrderRules((was) =>
									was ? { ...was, taxPercent: value } : was,
								)
							}
							placeholder="0"
						/>
						{/* ⚠️ Says what it will DO, with the real numbers, before it is
						    saved. A tax rate is the one setting where being one decimal
						    place out is invisible until an accountant finds it. */}
						<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
							{taxIsValid(orderRules?.taxPercent ?? "0")
								? percentToBasisPoints(orderRules?.taxPercent ?? "0") === 0
									? "No tax is added to an order."
									: `A ${orderRules?.taxPercent}% tax is added to every order, calculated on the total after any discount and including delivery.`
								: "That is not a tax rate between 0% and 100%."}
						</p>

						<BrandField
							label="Order numbers start with"
							hint="ORD-0001, CAF-0001 — changing it does not renumber past orders"
							value={orderRules?.numberPrefix ?? ""}
							onChange={(value) =>
								setOrderRules((was) =>
									was ? { ...was, numberPrefix: value } : was,
								)
							}
							placeholder="ORD"
						/>
						<BrandField
							label="Currency"
							hint="three letters — the currency new products are priced in"
							value={orderRules?.defaultCurrency ?? ""}
							onChange={(value) =>
								setOrderRules((was) =>
									was ? { ...was, defaultCurrency: value.toUpperCase() } : was,
								)
							}
							placeholder="CAD"
						/>

						<label className="flex items-start gap-3">
							<input
								type="checkbox"
								checked={orderRules?.autoConfirm ?? false}
								onChange={(event) =>
									setOrderRules((was) =>
										was ? { ...was, autoConfirm: event.target.checked } : was,
									)
								}
								className="mt-0.5 size-3.5 shrink-0 accent-[rgb(var(--console-ink))]"
							/>
							<span>
								<span className="block text-[11.5px] text-[var(--ink-60)]">
									Confirm paid orders automatically
								</span>
								<span className="mt-1 block text-[11px] text-[var(--ink-30)] leading-5">
									A paid order goes straight to confirmed instead of waiting for
									somebody to accept it. Turn this off if you check stock or
									availability by hand before committing.
								</span>
							</span>
						</label>

						<button
							type="button"
							disabled={
								saveModule.isPending ||
								!taxIsValid(orderRules?.taxPercent ?? "0")
							}
							onClick={() =>
								orderRules &&
								saveModule.mutate({
									moduleId: "orders",
									settings: {
										...(ordersModule?.settings ?? {}),
										numberPrefix: orderRules.numberPrefix,
										defaultCurrency: orderRules.defaultCurrency,
										autoConfirm: orderRules.autoConfirm,
										taxRateBasisPoints: percentToBasisPoints(
											orderRules.taxPercent,
										),
									},
								})
							}
							className={quietAction}
						>
							{saveModule.isPending ? "Saving…" : "Save order settings"}
						</button>
					</div>
				</>
			) : null}

			{inventoryModule ? (
				<>
					<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
						How your stock behaves
					</p>
					<div className="max-w-2xl space-y-4 border-[var(--console-line-soft)] border-t py-4">
						<BrandField
							label="Warn me when stock falls to"
							hint="how many left before an item shows as running low"
							value={stockRules?.defaultLowStockThreshold ?? ""}
							onChange={(value) =>
								setStockRules((was) =>
									was ? { ...was, defaultLowStockThreshold: value } : was,
								)
							}
							placeholder="5"
						/>
						<label className="flex items-start gap-3">
							<input
								type="checkbox"
								checked={stockRules?.allowNegativeStock ?? false}
								onChange={(event) =>
									setStockRules((was) =>
										was
											? { ...was, allowNegativeStock: event.target.checked }
											: was,
									)
								}
								className="mt-0.5 size-3.5 shrink-0 accent-[rgb(var(--console-ink))]"
							/>
							<span>
								<span className="block text-[11.5px] text-[var(--ink-60)]">
									Let stock go below zero
								</span>
								{/* ⚠️ Says what it COSTS, not what it does. Somebody enabling
								    this to stop checkout refusing a sale needs to know they
								    have just agreed to sell things they do not have. */}
								<span className="mt-1 block text-[11px] text-[var(--ink-30)] leading-5">
									Customers can keep buying after you have run out, and you
									fulfil when more arrives. Off, checkout refuses the sale
									instead — which is the safer answer unless you make to order.
								</span>
							</span>
						</label>

						<button
							type="button"
							disabled={saveModule.isPending}
							onClick={() =>
								stockRules &&
								saveModule.mutate({
									moduleId: "inventory",
									settings: {
										...(inventoryModule?.settings ?? {}),
										defaultLowStockThreshold: Math.max(
											0,
											Math.round(
												Number.parseFloat(
													stockRules.defaultLowStockThreshold || "0",
												),
											),
										),
										allowNegativeStock: stockRules.allowNegativeStock,
									},
								})
							}
							className={quietAction}
						>
							{saveModule.isPending ? "Saving…" : "Save stock settings"}
						</button>
					</div>
				</>
			) : null}

			{/*
			 * Only for businesses that ship. A workspace selling appointments has
			 * no parcels and should not be asked where they leave from.
			 */}
			{shippingModule ? (
				<>
					<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
						Where you ship from
					</p>
					<div className="max-w-2xl space-y-4 border-[var(--console-line-soft)] border-t py-4">
						<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
							The return address on your labels, and where a carrier measures
							delivery from. Leave it empty if you price delivery with your own
							rates and never call a carrier.
						</p>

						<BrandField
							label="Business name"
							hint="the name on the label"
							value={origin?.name ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({ ...(was ?? blankOrigin()), name: value }))
							}
							placeholder="Kestrel Audio"
						/>
						<BrandField
							label="Street address"
							value={origin?.line1 ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({
									...(was ?? blankOrigin()),
									line1: value,
								}))
							}
							placeholder="12 Foundry Lane"
						/>
						<BrandField
							label="Unit or suite"
							hint="optional"
							value={origin?.line2 ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({
									...(was ?? blankOrigin()),
									line2: value,
								}))
							}
						/>
						<BrandField
							label="City"
							value={origin?.city ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({ ...(was ?? blankOrigin()), city: value }))
							}
							placeholder="Calgary"
						/>
						<BrandField
							label="Province or state"
							hint="the short form a carrier uses, like AB"
							value={origin?.region ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({
									...(was ?? blankOrigin()),
									region: value,
								}))
							}
							placeholder="AB"
						/>
						<BrandField
							label="Postal code"
							value={origin?.postalCode ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({
									...(was ?? blankOrigin()),
									postalCode: value,
								}))
							}
							placeholder="T2P 1J9"
						/>
						<BrandField
							label="Country"
							hint="two letters"
							value={origin?.countryCode ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({
									...(was ?? blankOrigin()),
									countryCode: value.toUpperCase().slice(0, 2),
								}))
							}
							placeholder="CA"
						/>
						{/*
						 * ⚠️ Asked for, and said to be worth it, because the failure is
						 * LATE: rates quote fine without it and the label purchase is
						 * refused, after a customer has paid and picked a service.
						 */}
						<BrandField
							label="Phone"
							hint="more carriers need this than you would expect"
							value={origin?.phone ?? ""}
							onChange={(value) =>
								setOrigin((was) => ({
									...(was ?? blankOrigin()),
									phone: value,
								}))
							}
							placeholder="+1 403 555 0100"
						/>

						<div className="flex items-center gap-3">
							<button
								type="button"
								disabled={
									saveOrigin.isPending || !origin || !originIsUsable(origin)
								}
								onClick={() => saveOrigin.mutate()}
								className={`${quietAction} ${saveOrigin.isPending ? "shimmer-busy" : ""}`}
							>
								{saveOrigin.isPending ? "Saving…" : "Save"}
							</button>
							{origin && originIsFilled(origin) && !originIsUsable(origin) ? (
								<span className="text-[11.5px] text-[var(--ink-45)]">
									A carrier needs the name, street, city, postal code and
									country.
								</span>
							) : null}
						</div>
					</div>
				</>
			) : null}

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
/** What somebody types on the Orders settings section. */
type OrderRuleFields = {
	numberPrefix: string;
	defaultCurrency: string;
	autoConfirm: boolean;
	/** PERCENT as typed — "5", "12.5". Converted to basis points on save. */
	taxPercent: string;
};

type StockRuleFields = {
	defaultLowStockThreshold: string;
	allowNegativeStock: boolean;
};

/**
 * 🔴 Percent in, integer BASIS POINTS out.
 *
 * 5% must be exactly 500, never 499.99999. A float rate compounds into a wrong
 * cent on a large order and the customer's total stops adding up. Rounded rather
 * than truncated, so 12.345% typed by hand becomes 1235 and not 1234.
 */
const percentToBasisPoints = (value: string): number =>
	Math.round(Number.parseFloat(value || "0") * 100);

const taxIsValid = (value: string): boolean => {
	const points = percentToBasisPoints(value);
	return Number.isFinite(points) && points >= 0 && points <= 10_000;
};

/** The shape the shipping module stores. Mirrors `shippingOriginSchema`. */
type ShippingOriginFields = {
	name: string;
	line1: string;
	line2: string | null;
	city: string;
	region: string | null;
	postalCode: string;
	countryCode: string;
	phone: string | null;
};

const blankOrigin = (): ShippingOriginFields => ({
	name: "",
	line1: "",
	line2: "",
	city: "",
	region: "",
	postalCode: "",
	countryCode: "",
	phone: "",
});

/** Has somebody typed anything at all? An untouched form saves null, not junk. */
const originIsFilled = (origin: ShippingOriginFields): boolean =>
	Object.values(origin).some((value) => (value ?? "").trim() !== "");

/**
 * Enough for a carrier to work with.
 *
 * ⚠️ Deliberately stricter than "not empty". A half-typed address saves, then
 * fails at the carrier days later with a message about a field nobody
 * remembers — better to refuse here, where the person can see what is missing.
 */
const originIsUsable = (origin: ShippingOriginFields): boolean =>
	!originIsFilled(origin) ||
	([origin.name, origin.line1, origin.city, origin.postalCode].every(
		(value) => value.trim() !== "",
	) &&
		/^[A-Za-z]{2}$/.test(origin.countryCode.trim()));

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
