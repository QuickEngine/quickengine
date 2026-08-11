import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * About.
 *
 * ⚠️ The previous page's copy is NOT revived here. It is preserved at
 * `internal/snapshots/web-prerebuild/files/routes/about.tsx`, and its own comment
 * marks every line `PLACEHOLDER` — there was nothing to recover.
 *
 * 🔴 EVERY CLAIM BELOW IS TRUE TODAY and load-bearing. The specifics — the module
 * count, the single-transaction write, the tenant tests, the billing rule — are
 * drawn from what is actually built and are the entire reason this page is
 * credible rather than another startup about page. Do not add a customer count,
 * a logo wall, a funding line or a team that does not exist. This is the page
 * someone opens specifically to work out whether we are real, and it is the one
 * place an invented claim is certain to be checked.
 */
function AboutPage() {
	return (
		<TextPage
			title="Build more. Switch less."
			lede="QuickEngine Software is a two-person partnership in Alberta, Canada. We build QuickDash: one backend a business can actually run on, instead of six that almost fit."
		>
			<TextSection title="Why we exist">
				<div className={textProse}>
					<p>
						Every business runs on the same machinery underneath. Customers.
						Orders. Inventory. Invoices. Payments. Files. Bookings. A
						trustworthy record of what happened and when.
					</p>
					<p>
						Nobody sells that as one thing. So a business either pays to have it
						rebuilt from scratch, or rents six tools that were never designed to
						meet, and then spends the rest of its life reconciling them. Both
						options cost more the better the business does.
					</p>
					<p>
						We had built that same backend enough times to stop finding it
						interesting. QuickDash is that work done once, carefully, and
						configured per business rather than rewritten per business.
					</p>
				</div>
			</TextSection>

			<TextSection title="What it is">
				<div className={textProse}>
					<p>
						A modular backend, delivered as a service. You choose a workspace
						for your kind of business and switch on the modules it needs fifteen
						of them today, covering commerce, client records, invoicing,
						contracts, bookings, projects, files, fulfilment, shipping and
						reporting.
					</p>
					<p>
						Everything is reachable over one documented API, and everything the
						dashboard can do, your own code can do. There is no private
						interface we kept for ourselves.
					</p>
					<p>
						You do not have to use our front end at all. QuickConnect bridges
						any site you already own, any framework, or none, straight to your
						workspace. Your design, your domain, your hosting. We never host
						your code.
					</p>
				</div>
			</TextSection>

			<TextSection title="How we charge">
				<div className={textProse}>
					<p>
						We meter what costs us real infrastructure: storage, file
						conversion, email and SMS, automation runs, API volume. That is it.
					</p>
					<p>
						<strong>
							We never charge for an outcome your business earned.
						</strong>{" "}
						No fee per customer. No fee per invoice. No fee for creating a
						record. A tool that takes a cut of your growth is charging you for
						its own success, and it quietly punishes the thing you are trying to
						do.
					</p>
					<p>
						Modules are free, or unlocked once and then unlimited, or metered on
						the resource they actually consume. And there is no advertising
						anywhere inside the product. There never will be.
					</p>
				</div>
			</TextSection>

			<TextSection title="How it's built">
				<div className={textProse}>
					<p>
						Money and records are the parts nobody forgives you for getting
						wrong, so they are the parts we spent the most time on.
					</p>
					<p>
						A write commits your data, its idempotency key, its audit entry and
						its outbound event in a <strong>single database transaction</strong>
						. A retried request replays instead of duplicating, so a
						double-tapped button cannot become two orders and a repeated webhook
						cannot take payment twice.
					</p>
					<p>
						Every workspace is sealed from every other, and that is proven
						rather than promised: our test suite walks the real route table and
						attacks each endpoint with another tenant's credentials,
						deliberately combined in invalid ways. Any route that answers across
						that boundary fails the build, including routes written years from
						now.
					</p>
					<p>
						Outbound webhooks are signed so you can verify they came from us,
						and carry the identifiers you need to reject anything you have
						already handled.
					</p>
				</div>
			</TextSection>

			<TextSection title="Your data">
				<div className={textProse}>
					<p>
						It is Postgres, and it is yours. Exportable, portable, and leaving
						is a supported operation rather than a support ticket you have to
						fight.
					</p>
					<p>
						We would rather earn the next month than trap you into it. Lock-in
						is a product decision, and we have made the other one.
					</p>
				</div>
			</TextSection>

			<TextSection title="Who we are">
				<div className={textProse}>
					<p>
						Asher builds the product. Reese handles growth and everything that
						involves talking to people. That is the whole company.
					</p>
					<p>
						Two people is a real constraint and we treat it as one. It means we
						say no to most things, keep the product narrow, and answer our own
						support email. It also means we are not going to pretend to be
						bigger than we are.
					</p>
				</div>
			</TextSection>

			<TextSection title="Where we are">
				<div className={textProse}>
					<p>
						QuickDash is pre-launch. The backend is built and running, the
						interface is being designed now, and we are onboarding the first
						businesses by hand so we can watch what genuinely breaks rather than
						guess.
					</p>
					<p>
						No customer count, no logo wall, no case studies yet. When those
						exist they will be here, and they will be real.
					</p>
					<p>
						If being early appeals to you,{" "}
						<a href="/contact">tell us what you run</a>.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/about")({
	component: AboutPage,
});
