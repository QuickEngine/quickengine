import { CaretRightIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MODULE_LABELS } from "./sidebar-nav";

/**
 * Where you are inside the workspace.
 *
 * Derived from the path rather than passed in, so it cannot fall out of step
 * with what is actually rendered. Only ever one level deep today — the routes
 * are `/:workspace`, `/:workspace/:module` and `/:workspace/connect` — so this
 * shows the module and nothing more. It gains a level when record details get
 * their own URLs.
 *
 * At the workspace root it shows a single "Home" crumb rather than disappearing,
 * so the header keeps its shape instead of the breadcrumb popping in and out as
 * you navigate.
 */
export function Breadcrumbs({ workspaceId }: { workspaceId: string }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const rest = pathname.replace(`/${workspaceId}`, "").replace(/^\//, "");
	const [segment] = rest.split("/");
	const label = segment
		? segment === "connect"
			? "Connect"
			: (MODULE_LABELS[segment] ?? segment)
		: null;

	return (
		<nav
			aria-label="Breadcrumb"
			className="pointer-events-auto flex min-w-0 items-center gap-1.5 font-body text-[13px]"
		>
			{/* At the root, Home IS the current page — so it renders as text, not a
			    link to where you already are. Deeper in, it becomes the way back. */}
			{label === null ? (
				<span className="text-ink">Home</span>
			) : (
				<>
					{/* Desktop only. On mobile the header shows the page name alone —
					    the trail is one level deep, so the leaf is the whole answer and
					    a parent crumb is just noise at 375px. */}
					<Link
						to="/$workspace"
						params={{ workspace: workspaceId }}
						className="hidden text-dim transition-colors hover:text-ink md:inline"
					>
						Home
					</Link>
					<CaretRightIcon
						size={11}
						className="hidden shrink-0 text-dim/60 md:block"
					/>
					<span className="truncate text-ink">{label}</span>
				</>
			)}
		</nav>
	);
}
