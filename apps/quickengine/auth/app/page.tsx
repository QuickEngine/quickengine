import { clientEnv } from "@quickengine/env/client";
import Link from "next/link";

const destinations = [
	{
		label: "QuickEngine",
		description: "Company home, product updates, and public pages.",
		href: clientEnv.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	},
	{
		label: "Account",
		description: "Profile, billing, subscriptions, and app access.",
		href: clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	},
];

export default function Page() {
	return (
		<main className="min-h-dvh bg-[#02040a] px-6 py-6 text-white">
			<div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col">
				<header className="flex items-center justify-between">
					<Link className="font-medium text-sm text-white/80" href="/">
						QuickEngine Auth
					</Link>
					<Link
						className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-black transition hover:bg-white/86"
						href="/sign-in"
					>
						Sign in
					</Link>
				</header>

				<section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_24rem]">
					<div className="max-w-3xl">
						<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-sm text-white/66">
							<span className="size-2 rounded-full bg-[#80dbff]" />
							One identity for every QuickEngine product.
						</div>
						<h1 className="m-0 text-balance font-medium text-5xl leading-[0.96] tracking-normal md:text-7xl">
							Sign in once. Move through the suite.
						</h1>
						<p className="mt-6 max-w-2xl text-pretty text-lg text-white/62 leading-8">
							This is the central access layer for QuickEngine, QuickDash, and
							everything that comes next.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Link
								className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#80dbff] px-5 text-sm font-medium text-black transition hover:bg-[#a1e6ff]"
								href="/sign-up"
							>
								Create account
								<span aria-hidden="true">-&gt;</span>
							</Link>
							<Link
								className="inline-flex h-10 items-center justify-center rounded-md border border-white/14 px-5 text-sm font-medium text-white/86 transition hover:bg-white/8"
								href="/sign-in"
							>
								Sign in
							</Link>
						</div>
					</div>

					<div className="rounded-lg border border-white/12 bg-white/[0.045] p-4">
						<div className="rounded-md border border-white/10 bg-black/38 p-5">
							<p className="m-0 text-sm text-white/46">Available surfaces</p>
							<div className="mt-5 grid gap-3">
								{destinations.map((destination) => (
									<Link
										className="group rounded-md border border-white/10 bg-white/[0.035] p-4 transition hover:bg-white/[0.07]"
										href={destination.href}
										key={destination.label}
									>
										<div className="flex items-center justify-between gap-3">
											<h2 className="m-0 text-base font-medium">
												{destination.label}
											</h2>
											<span className="text-white/40 transition group-hover:text-white">
												-&gt;
											</span>
										</div>
										<p className="mt-2 mb-0 text-sm text-white/52 leading-6">
											{destination.description}
										</p>
									</Link>
								))}
							</div>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
