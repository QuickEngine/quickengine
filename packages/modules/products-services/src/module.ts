import { z } from "zod";

export const productsServicesSettingsSchema = z.object({
	defaultCurrency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	productLabelPlural: z.string().trim().min(1).max(40).default("Products"),
	serviceLabelPlural: z.string().trim().min(1).max(40).default("Services"),
	showSku: z.boolean().default(true),
});

export type ProductsServicesSettings = z.infer<
	typeof productsServicesSettingsSchema
>;

export const productsServicesModule = {
	id: "products-services",
	name: "Products & Services",
	description:
		"A flexible catalog of the physical goods, digital goods, services, packages, and rentals a business offers.",
	kind: "shared",
	dependsOn: [] as const,
	// Creating an offering is a business outcome, not infrastructure consumption.
	meteredAction: null,
	settingsSchema: productsServicesSettingsSchema,
	defaultSettings: productsServicesSettingsSchema.parse({}),
	firstActions: [
		{
			id: "products-services:create",
			version: 1,
			label: "Add your first product or service",
			description: "Create something your business sells or delivers.",
			moduleId: "products-services",
			intent: "create",
			priority: 10,
			steps: [
				{
					id: "products-services:create:offering",
					version: 1,
					label: "Add the offering",
					description:
						"Save a product or service with the details needed to sell it.",
					intent: "create",
				},
			],
		},
	] as const,
} as const;
