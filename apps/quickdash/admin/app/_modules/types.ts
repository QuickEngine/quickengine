// Props every per-module page receives from the [workspace]/[module] shell.
// Each module page is dynamically imported (see the shell's MODULE_PAGES map) so
// visiting one module only compiles that module's service + view — not all of them.
export type ModulePageProps = {
	workspaceId: string;
	// The enabled module's registry settings (jsonb). Each page parses this with
	// its own settingsSchema.
	settings: unknown;
	today: Date;
	// The route's URL search params (e.g. Reporting reads its date range from here).
	// Most module pages ignore it.
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};
