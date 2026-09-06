import { CaretLeftIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ModuleIcon } from "../module-icon";
import { NAV_GROUP, NAV_IDLE, NAV_ROW } from "../workspace-nav";
import {
	type ConfigurableModule,
	GROUPS,
	ICONS,
	type Section,
} from "./catalogue";
import { MODULE_SETTINGS } from "./module-fields";

/**
 * The sections this workspace actually has, grouped and ordered.
 *
 * 🔑 Shared by the rail and by the page, so the two can never disagree about
 * which section is the first one or whether a module has settings at all.
 */
export function settingsGroups(modules: readonly ConfigurableModule[]) {
	const moduleSections = modules
		.filter((module) => MODULE_SETTINGS[module.id])
		.map<Section>((module) => ({
			id: `module:${module.id}`,
			label: module.name,
			blurb: MODULE_SETTINGS[module.id].blurb,
			built: "here",
		}));

	/**
	 * ⚠️ SECOND, not last. Appending it put the only group that actually works
	 * below thirty-odd stubs, at the bottom of a scrolling list, where it was
	 * invisible without knowing to look. Built things go where they can be
	 * found; the inventory of unbuilt ones can wait underneath.
	 */
	const on = new Set(modules.map((module) => module.id));
	const applicable = GROUPS.map((entry) => ({
		...entry,
		items: entry.items.filter((item) => !item.needs || on.has(item.needs)),
	})).filter((entry) => entry.items.length > 0);

	return moduleSections.length
		? [
				applicable[0],
				{ group: "Modules", items: moduleSections },
				...applicable.slice(1),
			]
		: applicable;
}

/** The section a URL is asking for, or the first one when it names nothing. */
export function findSection(
	groups: ReturnType<typeof settingsGroups>,
	id: string | undefined,
) {
	const all = groups.flatMap((entry) => entry.items);
	return all.find((item) => item.id === id) ?? all[0];
}

/**
 * Settings, as the console's own left sidebar.
 *
 * 🔴 This used to be a rail INSIDE a dialog, and the dialog was the whole
 * problem: settings opened as a sheet over whatever you were doing, so it had
 * no address, no back button, and no way to be linked to. Configuring a
 * workspace is not a detour from the console, it is one of the things the
 * console is for.
 *
 * ⚠️ Links, not buttons on local state. A section is now a PLACE: it survives a
 * reload, it can be sent to somebody, and the browser's back button walks out of
 * settings the way it walks out of anything else.
 */
export function SettingsNav({
	workspace,
	workspaceName,
	modules = [],
	active,
}: {
	/** The slug, because these are links. */
	workspace: string;
	/** Named on the way out, so you can see what you are going back to. */
	workspaceName?: string;
	modules?: readonly ConfigurableModule[];
	active: string | undefined;
}) {
	const navigate = useNavigate();

	/**
	 * 🔴 Escape leaves settings.
	 *
	 * The dialog closed on Escape and people had learned it. Taking that away
	 * along with the dialog would have been a regression dressed up as a feature,
	 * and the way out of a full-screen context should never be harder to find
	 * than the way out of a sheet.
	 *
	 * ⚠️ Ignored while typing. Escape in the search box clears the search, which
	 * is what Escape means in a field; only Escape outside one leaves.
	 */
	useEffect(() => {
		const leave = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
				return;
			}
			void navigate({ to: "/$workspace", params: { workspace } });
		};
		window.addEventListener("keydown", leave);
		return () => window.removeEventListener("keydown", leave);
	}, [navigate, workspace]);
	const groups = settingsGroups(modules);
	const current = findSection(groups, active);

	/*
	 * 🔴 No search of its own any more.
	 *
	 * The rail had a "Search settings" box, and it was a second search box on a
	 * screen that already has one: the console's own search reaches settings
	 * sections along with every other page and record, so a person hunting for
	 * "tax" should not have to know that the answer is only findable from inside
	 * settings. One search, everywhere. See `workspace-search.tsx`.
	 */
	const found = groups;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/*
			 * 🔴 THE WAY OUT, and it has to be the first thing in the rail.
			 *
			 * The settings list REPLACES the workspace navigation, so without this
			 * there was no route back to Orders or Home at all: the dialog had a
			 * close button and the page that replaced it had nothing. A context that
			 * takes over the sidebar has to say how to leave it, in the place you
			 * look first.
			 *
			 * ⚠️ It names the workspace rather than saying "back". "Back" describes
			 * the mechanism; the workspace's own name describes where you land, and
			 * only one of those is useful when you arrived here by link and have no
			 * history to go back through.
			 */}
			{/* ⚠️ The navigation's OWN row shape and group padding, so this lands on
			    the same pixel Home does. The two lists swap in place, and a first
			    item that moves makes the whole sidebar appear to jump. */}
			<div className={NAV_GROUP}>
				<Link
					to="/$workspace"
					params={{ workspace }}
					className={`${NAV_ROW} ${NAV_IDLE}`}
				>
					<CaretLeftIcon size={15} className="shrink-0" />
					<span className="min-w-0 truncate">
						{workspaceName || "Workspace"}
					</span>
				</Link>
			</div>
			{/* ⚠️ No "Settings" heading. The trail at the top of the page already
			    says where you are, and the rail is plainly a list of settings the
			    moment you read two of its rows: a title here restated the page for
			    the width of the sidebar and pushed the first section down. */}
			<nav className="fade-ends min-h-0 flex-1 overflow-y-auto px-2 pb-2">
				{found.map(({ group, items }) => (
					<div key={group} className="mb-2 flex flex-col gap-1">
						<p className="px-2 pt-2 pb-1 text-[9px] text-[var(--ink-25)] uppercase tracking-[0.14em]">
							{group}
						</p>
						{items.map((item) => {
							/* A module section is named by its module, so it takes the
							   module's own icon rather than a second generic one. */
							const RailIcon = ICONS[item.id];
							const moduleId = item.id.startsWith("module:")
								? item.id.slice(7)
								: null;
							return (
								<Link
									key={item.id}
									to="/$workspace/settings/$section"
									params={{ workspace, section: item.id }}
									className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12px] transition-colors ${
										item.id === current?.id
											? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-90)]"
											: "text-[var(--ink-50)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)]"
									}`}
								>
									{moduleId ? (
										<ModuleIcon
											id={moduleId}
											className="size-[14px] shrink-0 opacity-70"
										/>
									) : RailIcon ? (
										<RailIcon size={14} className="shrink-0 opacity-70" />
									) : (
										<span className="size-[14px] shrink-0" />
									)}
									<span className="min-w-0 truncate">{item.label}</span>
								</Link>
							);
						})}
					</div>
				))}
				{found.length === 0 ? (
					<p className="px-2 py-3 text-[11.5px] text-[var(--ink-30)]">
						Nothing in settings matches that.
					</p>
				) : null}
			</nav>
		</div>
	);
}
