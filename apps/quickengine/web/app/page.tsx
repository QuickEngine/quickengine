import {
	faDiscord,
	faSquareLinkedin,
	faXTwitter,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@quickengine/ui/components/ui/accordion";
import Image from "next/image";

export default function Page() {
	return (
		<main className="site-page" aria-label="QuickEngine">
			<header className="site-header">
				<a className="site-header__brand" href="/">
					<Image
						className="site-header__brand-logo"
						src="/logo.svg"
						alt="QuickEngine"
						width={74}
						height={39}
						priority
					/>
				</a>
				<nav className="site-header__nav" aria-label="Primary navigation">
					<a className="site-header__nav-link" href="/apps">
						Apps
					</a>
					<a className="site-header__nav-link" href="/pricing">
						Pricing
					</a>
					<a className="site-header__nav-link" href="/developers">
						Developers
					</a>
					<a className="site-header__nav-link" href="/resources">
						Resources
					</a>
				</nav>
				<div className="site-header__action">
					<a className="site-header__action-primary" href="/signup">
						Start Building
					</a>
				</div>
			</header>
			<section className="hero-section" aria-labelledby="hero-title">
				<div className="hero-section__content">
					<h1 className="hero-section__title" id="hero-title">
						Introducing QuickDash
					</h1>
					<p className="hero-section__description">
						The dashboard for headless commerce.
					</p>
					<div className="hero-section__actions">
						<a className="hero-section__action" href="/quickdash">
							Try QuickDash
						</a>
						<form
							className="hero-section__checkout-form"
							action="/api/stripe/checkout"
							method="post"
						>
							<button className="hero-section__action-secondary" type="submit">
								Test Checkout
							</button>
						</form>
					</div>
				</div>
			</section>
			<section
				className="product-preview-section"
				aria-label="QuickDash preview"
			>
				<div className="preview-shell">
					<div className="preview-frame" />
				</div>
			</section>
			<section className="trusted-section" aria-labelledby="trusted-title">
				<p className="trusted-section__label" id="trusted-title">
					Built for the first wave of modern commerce teams
				</p>
				<div className="trusted-section__marquee" aria-hidden="true">
					<div className="trusted-section__track">
						<span>Independent sellers</span>
						<span>Custom storefronts</span>
						<span>Freelancers</span>
						<span>Small businesses</span>
						<span>Headless builders</span>
						<span>Early adopters</span>
						<span>Independent sellers</span>
						<span>Custom storefronts</span>
						<span>Freelancers</span>
						<span>Small businesses</span>
						<span>Headless builders</span>
						<span>Early adopters</span>
					</div>
				</div>
			</section>
			<section
				className="positioning-section"
				aria-labelledby="positioning-title"
			>
				<div className="section-shell section-shell--split">
					<p className="section-eyebrow">QuickDash</p>
					<div>
						<h2 className="section-title" id="positioning-title">
							Shopify-level control without the platform lock-in.
						</h2>
						<p className="section-copy">
							QuickDash is built for custom storefronts, flexible commerce
							flows, and teams who want the backend power without giving up the
							frontend.
						</p>
					</div>
				</div>
			</section>
			<section className="why-section" aria-labelledby="why-title">
				<div className="section-shell">
					<p className="section-eyebrow">Why QuickDash</p>
					<h2 className="section-title" id="why-title">
						The cleaner way to run headless commerce.
					</h2>
					<div className="section-grid section-grid--three">
						<div className="section-point">
							<h3>Bring your own frontend</h3>
							<p>Build the customer experience your way.</p>
						</div>
						<div className="section-point">
							<h3>Own the workflow</h3>
							<p>
								Manage products, orders, and customers from one focused place.
							</p>
						</div>
						<div className="section-point">
							<h3>Skip the app-store tax</h3>
							<p>Keep the flexibility without stacking expensive add-ons.</p>
						</div>
					</div>
				</div>
			</section>
			<section
				className="capabilities-section"
				aria-labelledby="capabilities-title"
			>
				<div className="section-shell">
					<p className="section-eyebrow">What It Can Do</p>
					<h2 className="section-title" id="capabilities-title">
						The commerce work stays in one place.
					</h2>
					<div className="section-grid section-grid--four">
						<div className="section-point">
							<h3>Products</h3>
							<p>
								Create, organize, and update your catalog from one dashboard.
							</p>
						</div>
						<div className="section-point">
							<h3>Orders</h3>
							<p>
								Track fulfillment, status, and customer activity without
								clutter.
							</p>
						</div>
						<div className="section-point">
							<h3>Customers</h3>
							<p>
								Keep buyer records and store activity connected to the workflow.
							</p>
						</div>
						<div className="section-point">
							<h3>Storefront API</h3>
							<p>
								Power a custom frontend while QuickDash handles commerce behind
								it.
							</p>
						</div>
					</div>
				</div>
			</section>
			<section className="built-for-section" aria-labelledby="built-for-title">
				<div className="section-shell section-shell--split">
					<p className="section-eyebrow">Built For</p>
					<div>
						<h2 className="section-title" id="built-for-title">
							For sellers, freelancers, and builders who need more control.
						</h2>
						<p className="section-copy">
							QuickDash starts with the people building real commerce
							experiences: small businesses, custom storefronts, and teams tired
							of fighting bloated platforms.
						</p>
					</div>
				</div>
			</section>
			<section
				className="comparison-section"
				aria-labelledby="comparison-title"
			>
				<div className="section-shell">
					<p className="section-eyebrow">The Old Way</p>
					<h2 className="section-title" id="comparison-title">
						Less patchwork. More control.
					</h2>
					<div className="section-grid section-grid--three">
						<div className="section-point">
							<h3>Template builders</h3>
							<p>Fast at first, restrictive when you outgrow them.</p>
						</div>
						<div className="section-point">
							<h3>Plugin-heavy stores</h3>
							<p>Flexible, until maintenance becomes the product.</p>
						</div>
						<div className="section-point">
							<h3>Enterprise platforms</h3>
							<p>
								Powerful, but priced for companies you are not trying to be.
							</p>
						</div>
					</div>
				</div>
			</section>
			<section className="steps-section" aria-labelledby="steps-title">
				<div className="section-shell">
					<p className="section-eyebrow">How It Works</p>
					<h2 className="section-title" id="steps-title">
						Launch the backend. Keep the storefront yours.
					</h2>
					<div className="section-grid section-grid--three">
						<div className="section-point">
							<h3>01. Create your store</h3>
							<p>Set up products, collections, and core commerce settings.</p>
						</div>
						<div className="section-point">
							<h3>02. Connect your frontend</h3>
							<p>
								Use QuickDash behind the scenes while your storefront stays
								custom.
							</p>
						</div>
						<div className="section-point">
							<h3>03. Manage everything</h3>
							<p>
								Run orders, customers, and inventory from a focused dashboard.
							</p>
						</div>
					</div>
				</div>
			</section>
			<section className="bridge-section" aria-labelledby="bridge-title">
				<div className="section-shell section-shell--split">
					<p className="section-eyebrow">QuickEngine</p>
					<div>
						<h2 className="section-title" id="bridge-title">
							QuickDash is the first app in a connected software suite.
						</h2>
						<p className="section-copy">
							QuickEngine starts with commerce, then grows into a family of
							focused tools for the way people actually work online.
						</p>
					</div>
				</div>
			</section>
			<section className="account-section" aria-labelledby="account-title">
				<div className="section-shell section-shell--split">
					<p className="section-eyebrow">One Account</p>
					<div>
						<h2 className="section-title" id="account-title">
							Sign in once. Move through the ecosystem.
						</h2>
						<p className="section-copy">
							The shared QuickEngine account is the foundation for every app,
							every dashboard, and every future workflow across the suite.
						</p>
					</div>
				</div>
			</section>
			<section
				className="philosophy-section"
				aria-labelledby="philosophy-title"
			>
				<div className="section-shell">
					<p className="section-eyebrow">Product Philosophy</p>
					<h2 className="section-title" id="philosophy-title">
						Clean software. Clear value. No attention-driven clutter.
					</h2>
					<p className="section-copy">
						QuickEngine is built around focused products people actually want to
						use, with revenue coming from useful software instead of intrusive
						ads or manipulative upsells.
					</p>
				</div>
			</section>
			<section
				className="testimonials-section"
				aria-labelledby="testimonials-title"
			>
				<div className="section-shell">
					<p className="section-eyebrow">Early Voices</p>
					<h2 className="section-title" id="testimonials-title">
						Reserved for the builders who try QuickDash first.
					</h2>
					<div className="testimonial-grid">
						<article className="testimonial-card">
							<p>
								Verified customer quote will live here after the first QuickDash
								beta interviews.
							</p>
							<span>Customer story</span>
						</article>
						<article className="testimonial-card">
							<p>
								Partner feedback will live here once launch collaborators are
								confirmed.
							</p>
							<span>Partner note</span>
						</article>
						<article className="testimonial-card">
							<p>
								Community reactions will live here after early access feedback
								starts coming in.
							</p>
							<span>Community voice</span>
						</article>
					</div>
				</div>
			</section>
			<section className="community-section" aria-labelledby="community-title">
				<div className="section-shell section-shell--split">
					<p className="section-eyebrow">Community</p>
					<div>
						<h2 className="section-title" id="community-title">
							Join early. Help shape what ships next.
						</h2>
						<p className="section-copy">
							The QuickEngine community starts with Discord: feedback, bug
							reports, early access, and direct conversation with the people
							building the suite.
						</p>
					</div>
				</div>
			</section>
			<section className="faq-section" aria-labelledby="faq-title">
				<div className="faq-section__copy">
					<p className="section-eyebrow">FAQ</p>
					<h2 className="section-title" id="faq-title">
						Questions, answered.
					</h2>
				</div>
				<Accordion
					className="faq-section__accordion"
					type="single"
					defaultValue="what-is-quickdash"
					collapsible
				>
					<AccordionItem
						className="faq-section__item"
						value="what-is-quickdash"
					>
						<AccordionTrigger className="faq-section__trigger">
							What is QuickDash?
						</AccordionTrigger>
						<AccordionContent className="faq-section__content">
							QuickDash is a commerce dashboard for headless storefronts. It
							handles the backend workflow while your frontend stays yours.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem className="faq-section__item" value="shopify">
						<AccordionTrigger className="faq-section__trigger">
							Is QuickDash replacing Shopify?
						</AccordionTrigger>
						<AccordionContent className="faq-section__content">
							QuickDash is for people who want more control over the storefront
							and commerce workflow, especially when a locked-in platform starts
							getting expensive or restrictive.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem className="faq-section__item" value="frontend">
						<AccordionTrigger className="faq-section__trigger">
							Do I need a custom frontend?
						</AccordionTrigger>
						<AccordionContent className="faq-section__content">
							QuickDash is built around bring-your-own-frontend commerce. If you
							want a custom storefront experience, that is exactly the point.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem className="faq-section__item" value="quickengine">
						<AccordionTrigger className="faq-section__trigger">
							What is QuickEngine?
						</AccordionTrigger>
						<AccordionContent className="faq-section__content">
							QuickEngine is the software suite behind QuickDash. One account is
							planned to connect focused apps for business, files, finance,
							media, and the web.
						</AccordionContent>
					</AccordionItem>
					<AccordionItem className="faq-section__item" value="launch">
						<AccordionTrigger className="faq-section__trigger">
							When is the full suite coming?
						</AccordionTrigger>
						<AccordionContent className="faq-section__content">
							QuickDash ships first. The rest of the suite will expand in phases
							as each app reaches the same quality bar.
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</section>
			<section className="cta-section" aria-label="Call to action">
				<div className="cta-section__content">
					<h1 className="cta-section__title">
						Build more.
						<br />
						Switch less.
					</h1>
					<p className="cta-section__description">
						Create one QuickEngine account and start using connected tools for
						business, files, finance, media, and the web.
					</p>
					<div className="cta-section__actions">
						<a className="cta-section__primary" href="/signup">
							Start Building
						</a>
						<form
							className="hero-section__checkout-form"
							action="/api/stripe/checkout"
							method="post"
						>
							<button className="cta-section__secondary" type="submit">
								Test Checkout
							</button>
						</form>
					</div>
				</div>
			</section>
			<footer className="site-footer">
				<div className="site-footer__main">
					<div className="site-footer__brand">
						<a className="site-footer__brand-link" href="/">
							<Image
								className="site-footer__brand-logo"
								src="/logo.svg"
								alt="QuickEngine"
								width={74}
								height={39}
							/>
						</a>
						<p className="site-footer__description">
							A connected suite for the way people actually work online. Build,
							manage, create, and move faster without jumping between tools.
						</p>
					</div>
					<nav className="site-footer__columns" aria-label="Footer navigation">
						<div className="site-footer__column">
							<h2 className="site-footer__heading">Products</h2>
							<a className="site-footer__column-link" href="/quickdash">
								QuickDash
							</a>
							<a className="site-footer__column-link" href="/quickflow">
								QuickFlow
							</a>
							<a className="site-footer__column-link" href="/apps">
								All Apps
							</a>
							<a className="site-footer__column-link" href="/suite">
								QuickEngine Suite
							</a>
						</div>
						<div className="site-footer__column">
							<h2 className="site-footer__heading">Company</h2>
							<a className="site-footer__column-link" href="/about">
								About
							</a>
							<a className="site-footer__column-link" href="/pricing">
								Pricing
							</a>
							<a className="site-footer__column-link" href="/blog">
								Blog
							</a>
							<a className="site-footer__column-link" href="/contact">
								Contact
							</a>
						</div>
						<div className="site-footer__column">
							<h2 className="site-footer__heading">Resources</h2>
							<a className="site-footer__column-link" href="/developers">
								Developers
							</a>
							<a className="site-footer__column-link" href="/docs">
								Docs
							</a>
							<a className="site-footer__column-link" href="/api">
								API / SDK
							</a>
							<a className="site-footer__column-link" href="/support">
								Support
							</a>
							<a className="site-footer__column-link" href="/discord">
								Discord
							</a>
						</div>
						<div className="site-footer__column">
							<h2 className="site-footer__heading">Legal</h2>
							<a className="site-footer__column-link" href="/terms">
								Terms
							</a>
							<a className="site-footer__column-link" href="/privacy">
								Privacy
							</a>
							<a className="site-footer__column-link" href="/security">
								Security
							</a>
						</div>
					</nav>
				</div>
				<div className="site-footer__bottom">
					<p className="site-footer__copyright">
						© 2026 QuickEngine Software. All rights reserved.
					</p>
					<nav className="site-footer__socials" aria-label="Social links">
						<a
							className="site-footer__social-link"
							href="https://www.linkedin.com/company/quickengine"
							target="_blank"
							rel="noreferrer"
							aria-label="QuickEngine on LinkedIn"
						>
							<FontAwesomeIcon icon={faSquareLinkedin} />
						</a>
						<a
							className="site-footer__social-link"
							href="https://x.com/QuickEngine"
							target="_blank"
							rel="noreferrer"
							aria-label="QuickEngine on X"
						>
							<FontAwesomeIcon icon={faXTwitter} />
						</a>
						<a
							className="site-footer__social-link"
							href="https://discord.gg/quickengine"
							target="_blank"
							rel="noreferrer"
							aria-label="QuickEngine on Discord"
						>
							<FontAwesomeIcon icon={faDiscord} />
						</a>
					</nav>
				</div>
			</footer>
		</main>
	);
}
