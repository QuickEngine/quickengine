import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

// Shared prose typography for legal pages — applied to the semantic children
// (h2 / p / ul / li / a) so each policy page just writes the content.
const prose =
	"mt-10 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:tracking-tight [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:leading-relaxed [&_li]:text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4";

export function LegalPage({
	title,
	updated,
	children,
}: {
	title: string;
	updated: string;
	children: ReactNode;
}) {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter py-24">
					<div className="mx-auto max-w-3xl">
						<h1 className="font-display font-normal text-4xl text-foreground tracking-tight sm:text-5xl">
							{title}
						</h1>
						<p className="mt-4 text-muted-foreground text-sm">
							Last updated {updated}
						</p>
						<div className={prose}>{children}</div>
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}

// Shared table styling for the policy tables.
export const legalTable =
	"mt-6 overflow-x-auto rounded-xl border border-border [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:border-border [&_th]:border-b [&_th]:bg-secondary/20 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-normal [&_th]:text-foreground [&_tbody_tr]:border-border [&_tbody_tr]:border-b [&_tbody_tr:last-child]:border-b-0";
