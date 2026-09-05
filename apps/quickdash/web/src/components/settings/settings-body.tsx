import { IntegrationsPanel } from "../integrations-panel";
import { CARD, type ConfigurableModule, SectionHeader } from "./catalogue";
import { ModuleSettingsForm } from "./module-settings-form";
import { SettingsSections } from "./sections";
import { findSection, settingsGroups } from "./settings-nav";
import {
	WorkspaceApiKeys,
	WorkspaceMembers,
	WorkspaceRoles,
	WorkspaceWebhooks,
} from "./workspace-access";
import { WorkspaceGeneral, WorkspaceUsage } from "./workspace-basics";
import { WORKSPACE_SETTINGS } from "./workspace-fields";
import { WorkspaceDanger, WorkspaceModules } from "./workspace-modules";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

/**
 * One section of settings, on the page.
 *
 * 🔴 This was the right-hand pane of a dialog. Nothing about the CONTENT needed
 * to change when settings stopped being a sheet over the console: the sections
 * were always real forms writing to real endpoints. What changed is that they
 * now have an address, so a section can be linked to, reloaded, and left with
 * the back button.
 */
export function SettingsBody({
	workspaceId,
	sectionId,
	modules = [],
	workspaceName = "",
	organizationId,
	accountUrl,
	environment = "live",
	apiUrl,
	workspace,
}: {
	/** The resolved id, not the slug: these write. */
	workspaceId: string;
	/** Which section to show. See `settingsGroups`. */
	sectionId: string | undefined;
	modules?: readonly ConfigurableModule[];
	workspaceName?: string;
	/** Usage is metered per ACCOUNT, not per workspace. */
	organizationId?: string | null;
	/** Where to land after archiving or deleting the workspace you are in. */
	accountUrl: string;
	environment?: "test" | "live";
	apiUrl: string;
	/** The URL slug. Integrations links back into this console with it. */
	workspace: string;
}) {
	const groups = settingsGroups(modules);
	const section = findSection(groups, sectionId);
	const openModule = section.id.startsWith("module:")
		? modules.find((module) => module.id === section.id.slice(7))
		: undefined;

	return (
		/* 🔴 `--console-bg`, the console's own ground, not `--console-pop`.
		   The pane inherited the POPOVER surface from the dialog it used to live
		   in, so settings arrived on the page as a lighter slab sitting on the
		   console: two tones where every other page is one. A dialog is a sheet
		   over the console and is meant to read as a different plane; a page is
		   the console. */
		<div className="min-h-full min-w-0 flex-1 bg-[var(--console-bg)]">
			<SectionHeader label={section.label} />
			<div className="p-6">
				{openModule ||
				WORKSPACE_SETTINGS[section.id] ||
				["api-keys", "webhooks", "members", "roles"].includes(section.id) ||
				section.renders ||
				section.id === "general" ||
				section.id === "usage" ||
				section.id === "modules" ||
				section.id === "danger" ? null : (
					<p className="mt-1.5 max-w-[36rem] text-[12.5px] text-[var(--ink-45)] leading-[1.55]">
						{section.blurb}
					</p>
				)}

				{section.id === "branding" ? (
					/* 🔑 Two sources, one page. The branding form is the same
				   implementation the settings page renders; the policy and
				   social links are workspace settings groups. Both are "how a
				   customer finds and recognises you", so they belong on one
				   page even though they are stored in different places. */
					<div className={`${CARD} flex flex-col gap-8`}>
						<div className="[&_p.mt-9]:mt-0">
							<SettingsSections workspaceId={workspaceId} only="branding" />
						</div>
						<WorkspaceSettingsForm
							workspaceId={workspaceId}
							section="branding"
						/>
					</div>
				) : section.id === "api-keys" ? (
					<div className={CARD}>
						<WorkspaceApiKeys
							workspaceId={workspaceId}
							organizationId={organizationId}
						/>
					</div>
				) : section.id === "webhooks" ? (
					<div className={CARD}>
						<WorkspaceWebhooks workspaceId={workspaceId} />
					</div>
				) : section.id === "members" ? (
					<div className={CARD}>
						<WorkspaceMembers organizationId={organizationId} />
					</div>
				) : section.id === "roles" ? (
					<div className={CARD}>
						<WorkspaceRoles organizationId={organizationId} />
					</div>
				) : WORKSPACE_SETTINGS[section.id] ? (
					<div className={CARD}>
						<WorkspaceSettingsForm
							workspaceId={workspaceId}
							section={section.id}
						/>
					</div>
				) : section.id === "modules" ? (
					<div className={CARD}>
						<WorkspaceModules
							workspaceId={workspaceId}
							organizationId={organizationId}
						/>
					</div>
				) : section.id === "danger" ? (
					<div className={CARD}>
						<WorkspaceDanger
							workspaceId={workspaceId}
							name={workspaceName}
							accountUrl={accountUrl}
							organizationId={organizationId}
						/>
					</div>
				) : section.id === "general" ? (
					<div className={CARD}>
						<WorkspaceGeneral
							workspaceId={workspaceId}
							name={workspaceName}
							organizationId={organizationId}
							environment={environment}
							apiUrl={apiUrl}
						/>
					</div>
				) : section.id === "usage" ? (
					<div className={CARD}>
						<WorkspaceUsage organizationId={organizationId} />
					</div>
				) : section.id === "integrations" ? (
					/* The same panel the header used to open, in the place it
						   belonged all along. */
					<div className={CARD}>
						<IntegrationsPanel
							workspaceId={workspaceId}
							organizationId={organizationId}
							workspace={workspace}
						/>
					</div>
				) : section.renders ? (
					/* 🔑 The real implementation, not a copy of it. One branding
				   form, one email template editor, one environment switch —
				   rendered here and on the settings page from the same file. */
					/* ⚠️ `mt-9` is the gap BETWEEN sections on the page, where they
				   stack. Shown one at a time there is nothing above to be
				   spaced from, so the first heading is pulled back up. */
					<div className={`${CARD} [&_p.mt-9]:mt-0`}>
						{section.renders.map((only) => (
							<SettingsSections
								key={only}
								workspaceId={workspaceId}
								only={only}
							/>
						))}
					</div>
				) : openModule ? (
					<div className={CARD}>
						<ModuleSettingsForm
							workspaceId={workspaceId}
							moduleId={openModule.id}
							moduleName={openModule.name}
							settings={(openModule.settings as Record<string, unknown>) ?? {}}
						/>
					</div>
				) : (
					<div className={`${CARD} border-dashed`}>
						{section.built ? (
							<>
								<p className="text-[12.5px] text-[var(--ink-70)]">
									Already built, elsewhere.
								</p>
								<p className="mt-1 text-[11.5px] text-[var(--ink-35)]">
									Lives in: {section.built}. It moves in here when this dialog
									replaces the settings page.
								</p>
							</>
						) : (
							<>
								<p className="text-[12.5px] text-[var(--ink-70)]">
									Not built yet.
								</p>
								<p className="mt-1 text-[11.5px] text-[var(--ink-35)]">
									This section is a placeholder so the shape of settings can be
									decided before any of it is written.
								</p>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
