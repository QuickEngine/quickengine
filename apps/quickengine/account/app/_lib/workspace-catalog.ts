export type BusinessTypeCatalogEntry = {
	id: string;
	name: string;
	description: string;
	keywords: readonly string[];
};

// Data, not UI: this can grow to hundreds of searchable workspace starting points.
// Every entry works with the universal foundation today; richer recipes layer on as
// their optional modules are built.
export const BUSINESS_TYPE_CATALOG: readonly BusinessTypeCatalogEntry[] = [
	{
		id: "ecommerce",
		name: "E-commerce",
		description: "Online products, orders, payments, and delivery.",
		keywords: ["store", "shop", "retail", "online"],
	},
	{
		id: "agency",
		name: "Agency",
		description: "Clients, projects, retainers, and deliverables.",
		keywords: ["creative", "marketing", "design", "development"],
	},
	{
		id: "freelancer",
		name: "Freelancer",
		description: "Independent client work from quote to delivery.",
		keywords: ["solo", "contractor", "independent"],
	},
	{
		id: "saas",
		name: "SaaS",
		description: "Software customers, subscriptions, and support.",
		keywords: ["software", "startup", "subscription"],
	},
	{
		id: "creator",
		name: "Creator",
		description: "Content, clients, products, and digital delivery.",
		keywords: ["influencer", "artist", "media", "content"],
	},
	{
		id: "consulting",
		name: "Consulting",
		description: "Engagements, appointments, billing, and outcomes.",
		keywords: ["advisor", "professional services", "coach"],
	},
	{
		id: "print-shop",
		name: "Print & Custom Production",
		description: "Quotes, artwork, production jobs, pickup, and shipping.",
		keywords: ["printing", "signs", "embroidery", "custom goods"],
	},
	{
		id: "local-services",
		name: "Local Services",
		description: "Bookings, customers, jobs, invoices, and follow-up.",
		keywords: ["cleaning", "repair", "home services", "mobile"],
	},
	{
		id: "trades",
		name: "Trades & Contracting",
		description: "Estimates, scheduled jobs, materials, and payment.",
		keywords: ["plumber", "electrician", "construction", "hvac"],
	},
	{
		id: "restaurant",
		name: "Restaurant & Food",
		description: "Customers, orders, inventory, pickup, and delivery.",
		keywords: ["cafe", "bakery", "catering", "food truck"],
	},
	{
		id: "retail",
		name: "Retail Store",
		description: "Products, customers, stock, orders, and fulfillment.",
		keywords: ["brick and mortar", "shop", "boutique", "pos"],
	},
	{
		id: "photography",
		name: "Photography & Video",
		description: "Bookings, contracts, shoots, files, and delivery.",
		keywords: ["photographer", "videographer", "studio", "wedding"],
	},
	{
		id: "health-wellness",
		name: "Health & Wellness",
		description: "Clients, appointments, services, and follow-up.",
		keywords: ["therapy", "nutrition", "massage", "wellness"],
	},
	{
		id: "fitness",
		name: "Fitness & Coaching",
		description: "Members, sessions, programs, and subscriptions.",
		keywords: ["gym", "trainer", "coach", "classes"],
	},
	{
		id: "beauty",
		name: "Beauty & Personal Care",
		description: "Appointments, clients, services, products, and payment.",
		keywords: ["salon", "barber", "spa", "nails"],
	},
	{
		id: "education",
		name: "Education & Training",
		description: "Students, sessions, materials, billing, and progress.",
		keywords: ["tutor", "course", "school", "workshop"],
	},
	{
		id: "nonprofit",
		name: "Nonprofit",
		description: "Supporters, programs, events, and communications.",
		keywords: ["charity", "community", "foundation", "donations"],
	},
	{
		id: "real-estate",
		name: "Real Estate",
		description: "Contacts, properties, appointments, and transactions.",
		keywords: ["realtor", "broker", "property", "rentals"],
	},
	{
		id: "automotive",
		name: "Automotive",
		description: "Customers, vehicles, appointments, jobs, and parts.",
		keywords: ["mechanic", "detailing", "repair", "garage"],
	},
	{
		id: "hospitality",
		name: "Hospitality",
		description: "Guests, bookings, services, and payments.",
		keywords: ["hotel", "vacation rental", "venue", "events"],
	},
] as const;

export function getBusinessType(
	id: string,
): BusinessTypeCatalogEntry | undefined {
	return BUSINESS_TYPE_CATALOG.find((entry) => entry.id === id);
}
