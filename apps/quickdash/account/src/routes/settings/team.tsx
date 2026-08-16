import { createFileRoute } from "@tanstack/react-router";

/**
 * `/settings/team`
 *
 * ⚠️ Cleared 2026-08-15 for the console redesign. Presentation only: every query,
 * action, permission check and helper this page used is still on disk, and the
 * route itself still exists so the navigation and every link to it keep working.
 */
function Page() {
	return <main className="min-h-full bg-[var(--console-bg)]" />;
}

export const Route = createFileRoute("/settings/team")({ component: Page });
