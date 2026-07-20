/**
 * The workspace recipe catalog.
 *
 * A recipe is a **recognition surface**, not a unique configuration. A plumber, an
 * electrician and an HVAC technician all want the same modules — but a plumber needs to see
 * "Plumber" in the list to believe the product understands their business. So many recipes
 * deliberately share a module set, and that is the point rather than duplication. It also
 * means the marginal cost of a recipe is near zero: adding one is a single entry.
 *
 * Built for hundreds. The picker searches names, categories and keywords, so the catalog can
 * grow without the UI needing to change.
 */
export type Recipe = {
	id: string;
	name: string;
	category: RecipeCategory;
	/** Extra search terms — what someone would type looking for this. */
	keywords: readonly string[];
	/** Module ids. Unknown or unbuilt ids are filtered at render; dependencies resolve. */
	modules: readonly string[];
	/**
	 * The opening sequence for this business, in order. Nothing renders these yet — they
	 * exist so the getting-started checklist is a rendering job later rather than a data
	 * migration. See BACKLOG → coach marks superseded by checklist.
	 */
	firstActions: readonly string[];
};

export type RecipeCategory =
	| "Retail & e-commerce"
	| "Services & consulting"
	| "Trades & home services"
	| "Creative & media"
	| "Health & wellness"
	| "Food & hospitality"
	| "Education"
	| "Property & events"
	| "Technology"
	| "Community";

// ---------------------------------------------------------------------------
// Shared module sets. Recipes compose these so a new entry is one line, and so a
// change to "how a service business starts" updates every service recipe at once.
// ---------------------------------------------------------------------------

const FOUNDATION = [
	"client-records",
	"invoicing",
	"payments",
	"fulfillment",
] as const;

/** Sells physical goods: catalog, stock, orders, shipping. */
const RETAIL = [
	...FOUNDATION,
	"products-services",
	"orders",
	"inventory",
	"shipping",
] as const;

/** Quotes work, delivers it over time, bills for it. */
const PROJECT_SERVICE = [
	...FOUNDATION,
	"quotes-estimates",
	"projects-tasks",
	"time-tracking",
	"contracts-esign",
] as const;

/** Quotes a job, does it, invoices — no long project tail. */
const JOB_SERVICE = [
	...FOUNDATION,
	"quotes-estimates",
	"bookings",
	"contracts-esign",
] as const;

/** Sells time in slots. */
const APPOINTMENT = [...FOUNDATION, "bookings", "products-services"] as const;

/** Sells access or output digitally. */
const DIGITAL = [
	...FOUNDATION,
	"products-services",
	"files",
	"reporting-analytics",
] as const;

const ACTIONS = {
	addClient: "client-records:create",
	addProduct: "products-services:create",
	sendQuote: "quotes-estimates:create",
	takeBooking: "bookings:create",
	logTime: "time-tracking:create",
	sendInvoice: "invoicing:create",
	uploadFile: "files:upload",
} as const;

const SERVICE_ACTIONS = [
	ACTIONS.addClient,
	ACTIONS.sendQuote,
	ACTIONS.sendInvoice,
] as const;
const RETAIL_ACTIONS = [ACTIONS.addProduct, ACTIONS.addClient] as const;
const BOOKING_ACTIONS = [ACTIONS.addClient, ACTIONS.takeBooking] as const;

export const RECIPES: readonly Recipe[] = [
	// --- Retail & e-commerce -------------------------------------------------
	{
		id: "ecommerce",
		name: "Online store",
		category: "Retail & e-commerce",
		keywords: ["ecommerce", "shop", "store", "dropshipping", "products"],
		modules: RETAIL,
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "boutique",
		name: "Boutique or small retail",
		category: "Retail & e-commerce",
		keywords: ["retail", "shop", "clothing", "gift shop", "storefront"],
		modules: RETAIL,
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "jewellery",
		name: "Jewellery & gemstones",
		category: "Retail & e-commerce",
		keywords: ["jewelry", "gems", "gemstones", "rocks", "minerals", "crystals"],
		modules: RETAIL,
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "subscription-box",
		name: "Subscription box",
		category: "Retail & e-commerce",
		keywords: ["subscription", "monthly box", "recurring", "curated"],
		modules: RETAIL,
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "reseller",
		name: "Reseller or marketplace seller",
		category: "Retail & e-commerce",
		keywords: [
			"reseller",
			"marketplace",
			"ebay",
			"etsy",
			"vintage",
			"flipping",
		],
		modules: RETAIL,
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "print-production",
		name: "Print & custom production",
		category: "Retail & e-commerce",
		keywords: [
			"printing",
			"custom",
			"embroidery",
			"signage",
			"screen printing",
		],
		modules: [...RETAIL, "quotes-estimates", "projects-tasks"],
		firstActions: [ACTIONS.addProduct, ACTIONS.sendQuote],
	},
	{
		id: "food-producer",
		name: "Food & drink producer",
		category: "Retail & e-commerce",
		keywords: ["bakery", "brewery", "coffee roaster", "packaged food", "farm"],
		modules: RETAIL,
		firstActions: RETAIL_ACTIONS,
	},

	// --- Services & consulting ----------------------------------------------
	{
		id: "agency",
		name: "Agency",
		category: "Services & consulting",
		keywords: ["marketing", "creative agency", "digital agency", "studio"],
		modules: PROJECT_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "freelancer",
		name: "Freelancer",
		category: "Services & consulting",
		keywords: ["freelance", "solo", "contractor", "independent"],
		modules: [...FOUNDATION, "quotes-estimates", "time-tracking", "files"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "consulting",
		name: "Consultancy",
		category: "Services & consulting",
		keywords: ["consultant", "advisory", "strategy", "coaching"],
		modules: PROJECT_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "accounting",
		name: "Accounting & bookkeeping",
		category: "Services & consulting",
		keywords: ["accountant", "bookkeeper", "tax", "payroll", "cpa"],
		modules: PROJECT_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "legal",
		name: "Legal practice",
		category: "Services & consulting",
		keywords: ["lawyer", "solicitor", "attorney", "law firm", "paralegal"],
		modules: PROJECT_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "recruiting",
		name: "Recruiting & staffing",
		category: "Services & consulting",
		keywords: ["recruiter", "staffing", "headhunter", "talent"],
		modules: PROJECT_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "translation",
		name: "Translation & localisation",
		category: "Services & consulting",
		keywords: ["translator", "localization", "interpreting", "subtitling"],
		modules: PROJECT_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "virtual-assistant",
		name: "Virtual assistant",
		category: "Services & consulting",
		keywords: ["va", "admin", "executive assistant", "remote support"],
		modules: [...FOUNDATION, "time-tracking", "projects-tasks"],
		firstActions: [ACTIONS.addClient, ACTIONS.logTime],
	},

	// --- Trades & home services ---------------------------------------------
	{
		id: "plumbing",
		name: "Plumbing",
		category: "Trades & home services",
		keywords: ["plumber", "pipes", "drains", "boiler", "heating"],
		modules: JOB_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "electrical",
		name: "Electrical",
		category: "Trades & home services",
		keywords: ["electrician", "wiring", "rewire", "sparky"],
		modules: JOB_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "hvac",
		name: "HVAC & refrigeration",
		category: "Trades & home services",
		keywords: ["hvac", "heating", "air conditioning", "furnace", "cooling"],
		modules: JOB_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "construction",
		name: "Construction & contracting",
		category: "Trades & home services",
		keywords: ["builder", "contractor", "renovation", "remodel", "carpentry"],
		modules: [...JOB_SERVICE, "projects-tasks", "inventory"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "landscaping",
		name: "Landscaping & grounds",
		category: "Trades & home services",
		keywords: ["landscaper", "gardening", "lawn care", "tree surgeon"],
		modules: JOB_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "cleaning",
		name: "Cleaning services",
		category: "Trades & home services",
		keywords: ["cleaner", "janitorial", "housekeeping", "commercial cleaning"],
		modules: JOB_SERVICE,
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "auto-repair",
		name: "Auto repair & servicing",
		category: "Trades & home services",
		keywords: ["mechanic", "garage", "mot", "bodyshop", "tyres"],
		modules: [...JOB_SERVICE, "inventory", "products-services"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "appliance-repair",
		name: "Repair & maintenance",
		category: "Trades & home services",
		keywords: ["repair", "handyman", "maintenance", "appliance", "fix"],
		modules: JOB_SERVICE,
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "moving",
		name: "Moving & removals",
		category: "Trades & home services",
		keywords: ["movers", "removals", "haulage", "storage", "delivery"],
		modules: [...JOB_SERVICE, "shipping"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "pest-control",
		name: "Pest control",
		category: "Trades & home services",
		keywords: ["pest", "exterminator", "rodents", "insects"],
		modules: JOB_SERVICE,
		firstActions: BOOKING_ACTIONS,
	},

	// --- Creative & media ----------------------------------------------------
	{
		id: "photography",
		name: "Photography",
		category: "Creative & media",
		keywords: ["photographer", "wedding", "portrait", "shoot", "studio"],
		modules: [...APPOINTMENT, "files", "contracts-esign", "quotes-estimates"],
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "videography",
		name: "Video & film production",
		category: "Creative & media",
		keywords: ["videographer", "film", "editing", "production", "content"],
		modules: [...PROJECT_SERVICE, "files"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "design",
		name: "Design studio",
		category: "Creative & media",
		keywords: [
			"graphic design",
			"branding",
			"illustration",
			"ux",
			"web design",
		],
		modules: [...PROJECT_SERVICE, "files"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "creator",
		name: "Content creator",
		category: "Creative & media",
		keywords: ["youtube", "influencer", "streamer", "podcast", "newsletter"],
		modules: DIGITAL,
		firstActions: [ACTIONS.addProduct, ACTIONS.uploadFile],
	},
	{
		id: "music",
		name: "Music & audio",
		category: "Creative & media",
		keywords: ["musician", "band", "producer", "recording", "dj", "mixing"],
		modules: [...APPOINTMENT, "files", "quotes-estimates"],
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "artist",
		name: "Artist & maker",
		category: "Creative & media",
		keywords: ["art", "craft", "handmade", "ceramics", "prints", "commissions"],
		modules: [...RETAIL, "quotes-estimates"],
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "writing",
		name: "Writing & editorial",
		category: "Creative & media",
		keywords: ["writer", "copywriter", "editor", "journalist", "ghostwriter"],
		modules: [...FOUNDATION, "quotes-estimates", "time-tracking", "files"],
		firstActions: SERVICE_ACTIONS,
	},

	// --- Health & wellness ---------------------------------------------------
	{
		id: "fitness",
		name: "Personal training & fitness",
		category: "Health & wellness",
		keywords: ["personal trainer", "gym", "coach", "pilates", "yoga"],
		modules: APPOINTMENT,
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "salon",
		name: "Salon & barbering",
		category: "Health & wellness",
		keywords: ["hairdresser", "barber", "beauty", "nails", "stylist"],
		modules: [...APPOINTMENT, "inventory"],
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "spa",
		name: "Spa & massage",
		category: "Health & wellness",
		keywords: ["massage", "spa", "therapy", "wellness", "treatment"],
		modules: APPOINTMENT,
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "clinic",
		name: "Clinic & private practice",
		category: "Health & wellness",
		keywords: ["therapist", "physio", "dentist", "chiropractor", "counselling"],
		modules: [...APPOINTMENT, "files", "contracts-esign"],
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "veterinary",
		name: "Veterinary",
		category: "Health & wellness",
		keywords: ["vet", "animal", "pet care", "grooming"],
		modules: [...APPOINTMENT, "inventory", "products-services"],
		firstActions: BOOKING_ACTIONS,
	},

	// --- Food & hospitality --------------------------------------------------
	{
		id: "restaurant",
		name: "Restaurant & cafe",
		category: "Food & hospitality",
		keywords: ["restaurant", "cafe", "bar", "bistro", "takeaway"],
		modules: [...FOUNDATION, "products-services", "orders", "inventory"],
		firstActions: RETAIL_ACTIONS,
	},
	{
		id: "catering",
		name: "Catering",
		category: "Food & hospitality",
		keywords: ["caterer", "events", "food truck", "private chef"],
		modules: [...JOB_SERVICE, "products-services", "inventory"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "accommodation",
		name: "Accommodation & short lets",
		category: "Food & hospitality",
		keywords: ["airbnb", "bnb", "hotel", "guesthouse", "holiday let"],
		modules: [...APPOINTMENT, "contracts-esign"],
		firstActions: BOOKING_ACTIONS,
	},

	// --- Education -----------------------------------------------------------
	{
		id: "tutoring",
		name: "Tutoring & lessons",
		category: "Education",
		keywords: ["tutor", "teacher", "lessons", "music teacher", "driving"],
		modules: [...APPOINTMENT, "time-tracking"],
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "training",
		name: "Training & workshops",
		category: "Education",
		keywords: ["trainer", "workshop", "seminar", "corporate training"],
		modules: [...APPOINTMENT, "products-services", "files"],
		firstActions: BOOKING_ACTIONS,
	},
	{
		id: "online-course",
		name: "Online courses",
		category: "Education",
		keywords: [
			"course",
			"elearning",
			"cohort",
			"membership",
			"coaching program",
		],
		modules: DIGITAL,
		firstActions: [ACTIONS.addProduct, ACTIONS.addClient],
	},

	// --- Property & events ---------------------------------------------------
	{
		id: "real-estate",
		name: "Real estate & lettings",
		category: "Property & events",
		keywords: ["estate agent", "realtor", "lettings", "property", "rentals"],
		modules: [...JOB_SERVICE, "files", "projects-tasks"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "property-management",
		name: "Property management",
		category: "Property & events",
		keywords: ["landlord", "property manager", "maintenance", "tenants"],
		modules: [...FOUNDATION, "projects-tasks", "contracts-esign", "files"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "events",
		name: "Event planning",
		category: "Property & events",
		keywords: ["event planner", "wedding planner", "conference", "venue"],
		modules: [...PROJECT_SERVICE, "bookings"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "equipment-rental",
		name: "Equipment & venue rental",
		category: "Property & events",
		keywords: ["rental", "hire", "equipment", "venue", "kit"],
		modules: [...APPOINTMENT, "inventory", "contracts-esign"],
		firstActions: BOOKING_ACTIONS,
	},

	// --- Technology ----------------------------------------------------------
	{
		id: "saas",
		name: "SaaS & software",
		category: "Technology",
		keywords: ["saas", "software", "app", "platform", "product"],
		modules: DIGITAL,
		firstActions: [ACTIONS.addClient, ACTIONS.sendInvoice],
	},
	{
		id: "dev-shop",
		name: "Software development",
		category: "Technology",
		keywords: [
			"developer",
			"web development",
			"app development",
			"engineering",
		],
		modules: [...PROJECT_SERVICE, "files"],
		firstActions: SERVICE_ACTIONS,
	},
	{
		id: "it-support",
		name: "IT support & managed services",
		category: "Technology",
		keywords: ["it support", "msp", "helpdesk", "networks", "sysadmin"],
		modules: [...JOB_SERVICE, "projects-tasks", "inventory"],
		firstActions: SERVICE_ACTIONS,
	},

	// --- Community -----------------------------------------------------------
	{
		id: "nonprofit",
		name: "Nonprofit & charity",
		category: "Community",
		keywords: ["charity", "nonprofit", "ngo", "fundraising", "donations"],
		modules: [...FOUNDATION, "projects-tasks", "files"],
		firstActions: [ACTIONS.addClient, ACTIONS.sendInvoice],
	},
	{
		id: "membership",
		name: "Club & membership",
		category: "Community",
		keywords: ["club", "membership", "society", "association", "community"],
		modules: [...APPOINTMENT, "products-services"],
		firstActions: BOOKING_ACTIONS,
	},
];

/** Everything a recipe should match on when searched. */
const haystack = (recipe: Recipe) =>
	`${recipe.name} ${recipe.category} ${recipe.keywords.join(" ")}`.toLowerCase();

/**
 * Filter recipes by a free-text query. Every whitespace-separated term must match
 * somewhere, so "photo wedding" narrows rather than widens.
 */
export function searchRecipes(query: string): readonly Recipe[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return RECIPES;
	return RECIPES.filter((recipe) => {
		const text = haystack(recipe);
		return terms.every((term) => text.includes(term));
	});
}

/** Recipes grouped by category, preserving catalog order, for browsing. */
export function groupRecipes(
	recipes: readonly Recipe[],
): Array<[RecipeCategory, Recipe[]]> {
	const groups = new Map<RecipeCategory, Recipe[]>();
	for (const recipe of recipes) {
		const existing = groups.get(recipe.category);
		if (existing) existing.push(recipe);
		else groups.set(recipe.category, [recipe]);
	}
	return [...groups.entries()];
}

export function findRecipe(id: string): Recipe | undefined {
	return RECIPES.find((recipe) => recipe.id === id);
}
