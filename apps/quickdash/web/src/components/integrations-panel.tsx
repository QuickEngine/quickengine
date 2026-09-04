import {
	AddressBookIcon,
	ArrowSquareOutIcon,
	ArrowsClockwiseIcon,
	BankIcon,
	BrowserIcon,
	CalculatorIcon,
	CalendarBlankIcon,
	ChartLineUpIcon,
	ChatCircleIcon,
	ClockIcon,
	CloudArrowUpIcon,
	CodeIcon,
	CreditCardIcon,
	EnvelopeSimpleIcon,
	GlobeIcon,
	type Icon,
	KeyIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	MegaphoneIcon,
	PackageIcon,
	PenNibIcon,
	PhoneIcon,
	PlugsConnectedIcon,
	ShareNetworkIcon,
	StorefrontIcon,
	TruckIcon,
	UsersThreeIcon,
	WarehouseIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { sessionApi } from "../lib/api";
import { INTEGRATIONS } from "./integrations-catalogue";

/**
 * What this workspace is plugged into.
 *
 * 🔑 A dock, sharing the assistant's column. Integrations and the assistant are
 * both things you consult beside your work and both want the same width, so
 * they take turns in one column rather than adding a fifth region to a console
 * that already has four.
 *
 * 🔴 It works without the assistant, deliberately. Connecting Gmail is useful
 * to somebody who will never open the AI — so integrations are a peer of it,
 * not a section inside it.
 *
 * ⚠️ Payments are REAL and come from `/account/integrations`; everything below
 * that line is named but not connectable yet. Naming them is the point — this
 * is the inventory of what a workspace should be able to plug in, written down
 * before any of it is built, and each says plainly that it is not ready.
 */

type PaymentIntegration = {
	workspaceId: string;
	workspaceName: string;
	provider: string;
	environment: "test" | "live";
	status: string;
	connected: boolean;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
};

/** One icon per GROUP rather than per brand: Phosphor has no brand marks, and
 *  a row of identical plugs would be worse than a row that says what the group
 *  is for. */
const GROUP_ICONS: Readonly<Record<string, Icon>> = {
	envelope: EnvelopeSimpleIcon,
	card: CreditCardIcon,
	bank: BankIcon,
	package: PackageIcon,
	warehouse: WarehouseIcon,
	repeat: ArrowsClockwiseIcon,
	pen: PenNibIcon,
	browser: BrowserIcon,
	share: ShareNetworkIcon,
	phone: PhoneIcon,
	clock: ClockIcon,
	users: UsersThreeIcon,
	code: CodeIcon,
	key: KeyIcon,
	megaphone: MegaphoneIcon,
	chat: ChatCircleIcon,
	storefront: StorefrontIcon,
	truck: TruckIcon,
	calculator: CalculatorIcon,
	cloud: CloudArrowUpIcon,
	calendar: CalendarBlankIcon,
	chart: ChartLineUpIcon,
	"address-book": AddressBookIcon,
	globe: GlobeIcon,
	lightning: LightningIcon,
};

export function IntegrationsPanel({
	workspaceId,
	organizationId,
	workspace,
}: {
	workspaceId: string;
	organizationId: string | null | undefined;
	/** The URL slug, for links into this console. */
	workspace: string;
}) {
	const [find, setFind] = useState("");
	const integrations = useQuery({
		queryKey: ["quickdash", "integrations", organizationId],
		queryFn: async () =>
			(
				await sessionApi.request<{ items: PaymentIntegration[] }>(
					`/account/integrations?organizationId=${encodeURIComponent(
						organizationId ?? "",
					)}`,
				)
			).data,
		enabled: Boolean(organizationId),
	});

	// Only this workspace's, and only what actually took a charge.
	const mine = (integrations.data?.items ?? []).filter(
		(row) => row.workspaceId === workspaceId,
	);

	const needle = find.trim().toLowerCase();
	const shown = needle
		? INTEGRATIONS.map((entry) => ({
				...entry,
				items: entry.items.filter((item) =>
					`${item.name} ${item.detail} ${entry.group}`
						.toLowerCase()
						.includes(needle),
				),
			})).filter((entry) => entry.items.length > 0)
		: INTEGRATIONS;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 px-3">
				<PlugsConnectedIcon size={15} className="text-[var(--ink-40)]" />
				<p className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-80)]">
					Integrations
				</p>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				<p className="px-1 pt-1 pb-2 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
					Connected
				</p>

				{integrations.isPending ? (
					<p className="px-1 text-[11.5px] text-[var(--ink-30)]">Checking…</p>
				) : mine.length === 0 ? (
					<p className="px-1 pb-2 text-[11.5px] text-[var(--ink-35)] leading-5">
						Nothing connected yet. Payments is the one you need first, without
						it this workspace cannot take money.
					</p>
				) : (
					<div className="flex flex-col">
						{mine.map((row) => (
							<div
								key={`${row.provider}-${row.environment}`}
								className="flex items-center gap-2.5 rounded-lg px-1.5 py-2"
							>
								<CreditCardIcon
									size={15}
									className="shrink-0 text-[var(--ink-40)]"
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[12px] text-[var(--ink-85)] capitalize">
										{row.provider}
									</p>
									<p className="mt-0.5 truncate text-[11px] text-[var(--ink-30)]">
										{/* 🔴 "Connected" is not the useful fact — whether it can
										    take a card is. A provider that finished onboarding and
										    still refuses charges looks fine on a badge and loses
										    money at checkout. */}
										{row.chargesEnabled
											? `Taking payments · ${row.environment}`
											: row.connected
												? "Connected, not taking payments yet"
												: "Setup unfinished"}
									</p>
								</div>
								<span
									aria-hidden="true"
									className={`size-1.5 shrink-0 rounded-full ${
										row.chargesEnabled
											? "bg-[var(--signal-success)]"
											: "bg-[var(--signal-attention)]"
									}`}
								/>
							</div>
						))}
					</div>
				)}

				<Link
					to="/$workspace/$module/$section"
					params={{
						workspace,
						module: "payments",
						section: "providers",
					}}
					className="mt-1 flex items-center gap-2 rounded-lg px-1.5 py-2 text-[11.5px] text-[var(--ink-45)] no-underline transition-colors hover:text-[var(--ink-85)]"
				>
					<ArrowSquareOutIcon size={13} className="shrink-0" />
					Manage payment providers
				</Link>

				<p className="px-1 pt-4 pb-1.5 text-[10.5px] text-[var(--ink-30)] uppercase tracking-[0.08em]">
					Available soon
				</p>
				{/* ⚠️ Fifty-eight of them, so a filter is not a nicety. Matching the
				    detail as well as the name means "labels" finds Shippo. */}
				<label className="mb-2 flex h-8 items-center gap-2 rounded-md border border-[var(--console-line)] px-2">
					<MagnifyingGlassIcon
						size={13}
						aria-hidden="true"
						className="shrink-0 text-[var(--ink-30)]"
					/>
					<span className="sr-only">Filter integrations</span>
					<input
						value={find}
						onChange={(event) => setFind(event.target.value)}
						placeholder="Filter"
						className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
					/>
				</label>

				{shown.length === 0 ? (
					<p className="px-1 text-[11.5px] text-[var(--ink-30)]">
						Nothing matches that.
					</p>
				) : null}

				{shown.map((entry) => {
					const GroupIcon = GROUP_ICONS[entry.icon] ?? PlugsConnectedIcon;
					return (
						<div key={entry.group} className="mb-2">
							<p className="px-1 pb-1 text-[10.5px] text-[var(--ink-25)]">
								{entry.group}
							</p>
							{entry.items.map((item) => (
								<div
									key={item.id}
									className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 opacity-60"
								>
									<GroupIcon
										size={15}
										className="shrink-0 text-[var(--ink-35)]"
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate text-[12px] text-[var(--ink-70)]">
											{item.name}
										</p>
										<p className="truncate text-[11px] text-[var(--ink-30)]">
											{item.detail}
										</p>
									</div>
								</div>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
