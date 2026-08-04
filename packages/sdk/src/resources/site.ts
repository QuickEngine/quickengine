import type { QuickClient } from "../client";
import type {
	QuickCheckoutInput,
	QuickCheckoutItem,
	QuickCheckoutResult,
	QuickConnectContext,
	QuickCursorPage,
	QuickCustomerOrderDetail,
	QuickOrder,
	QuickResponse,
	QuickShippingQuote,
	QuickWishlistItem,
} from "../types";

export type QuickCategory = {
	id: string;
	name: string;
	slug: string;
	kind: "category" | "collection";
	itemCount: number;
	children: QuickCategory[];
	[field: string]: unknown;
};

export type QuickCustomerConversation = {
	id: string;
	subject: string;
	status: "open" | "closed";
	lastMessageAt: string;
	[field: string]: unknown;
};

/** Public, browser-safe operations for a custom site. */
export class SiteResource {
	constructor(private readonly client: QuickClient) {}

	context() {
		return this.client.request<QuickConnectContext>("/customer/context");
	}

	listCategories(kind?: "category" | "collection") {
		const query = kind ? `?kind=${kind}` : "";
		return this.client.request<{ items: QuickCategory[] }>(
			`/categories${query}`,
		);
	}

	listCategoryItems(slug: string) {
		return this.client.request<{ itemIds: string[] }>(
			`/categories/${encodeURIComponent(slug)}/items`,
		);
	}

	content() {
		return this.client.request<{ content: Record<string, unknown> }>(
			"/content",
		);
	}

	previewDiscount(input: { code: string; items: QuickCheckoutItem[] }) {
		return this.client.request<
			| {
					valid: true;
					code: string;
					subtotalCents: number;
					discountCents: number;
					totalAfterDiscountCents: number;
					currency: string;
			  }
			| { valid: false; reason: string; message: string }
		>("/discounts/preview", { method: "POST", body: input });
	}

	quoteShipping(input: {
		items: QuickCheckoutItem[];
		destination: {
			countryCode: string;
			regionCode?: string;
			postalCode?: string;
		};
		discountCode?: string;
	}) {
		return this.client.request<QuickShippingQuote>("/shipping/quote", {
			method: "POST",
			body: input,
		});
	}

	checkout(input: QuickCheckoutInput, idempotencyKey: string) {
		return this.client.request<QuickCheckoutResult>("/checkout", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}

	capture(externalPaymentId: string) {
		return this.client.request<{
			captured: true;
			settlement: { applied: boolean; reason?: string; orderId?: string };
		}>(`/checkout/${encodeURIComponent(externalPaymentId)}/capture`, {
			method: "POST",
		});
	}
}

/** The end customer's own identity, records, saved items, and conversations. */
export class CustomerResource {
	constructor(private readonly client: QuickClient) {}

	requestSignInLink(email: string) {
		return this.client.request<{ sent: true }>("/customer/auth/request-link", {
			method: "POST",
			body: { email },
		});
	}

	verifySignInLink(token: string) {
		return this.client.request<{ token: string; expiresAt: string }>(
			"/customer/auth/verify",
			{ method: "POST", body: { token } },
		);
	}

	me() {
		return this.client.request<{ customerId: string; hasRecords: boolean }>(
			"/customer/auth/me",
		);
	}

	signOut() {
		return this.client.request<{ signedOut: true }>("/customer/auth/sign-out", {
			method: "POST",
		});
	}

	listOrders(
		options: {
			cursor?: string;
			limit?: number;
			direction?: "asc" | "desc";
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickOrder>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.direction) query.set("direction", options.direction);
		return this.client.request(
			`/customer/orders${query.size ? `?${query}` : ""}`,
		);
	}

	getOrder(id: string) {
		return this.client.request<QuickCustomerOrderDetail>(
			`/customer/orders/${encodeURIComponent(id)}`,
		);
	}

	listBookings() {
		return this.client.request<{ items: unknown[]; page: unknown }>(
			"/customer/bookings",
		);
	}

	listInvoices() {
		return this.client.request<{ items: unknown[]; page: unknown }>(
			"/customer/invoices",
		);
	}

	listWishlist() {
		return this.client.request<{ items: QuickWishlistItem[] }>(
			"/customer/wishlist",
		);
	}

	saveWishlistItem(input: {
		catalogItemId: string;
		catalogItemVariantId?: string | null;
	}) {
		return this.client.request<{ saved: true }>("/customer/wishlist", {
			method: "POST",
			body: input,
		});
	}

	removeWishlistItem(catalogItemId: string) {
		return this.client.request<{ removed: true }>(
			`/customer/wishlist/${encodeURIComponent(catalogItemId)}`,
			{ method: "DELETE" },
		);
	}

	mergeWishlist(
		items: Array<{
			catalogItemId: string;
			catalogItemVariantId?: string | null;
		}>,
	) {
		return this.client.request<{ merged: number }>("/customer/wishlist/merge", {
			method: "POST",
			body: { items },
		});
	}

	listReviews() {
		return this.client.request<{ items: unknown[] }>("/customer/reviews");
	}

	createReview(input: {
		catalogItemId: string;
		rating: number;
		title?: string | null;
		body?: string | null;
	}) {
		return this.client.request<{
			id: string;
			status: string;
			verifiedPurchase: boolean;
		}>("/customer/reviews", { method: "POST", body: input });
	}

	getReferral() {
		return this.client.request<{
			referral: {
				code: string;
				totalReferrals: number;
				totalEarnedCents: number;
			} | null;
		}>("/customer/referral-code");
	}

	createReferral() {
		return this.client.request<{ code: string }>("/customer/referral-code", {
			method: "POST",
		});
	}

	listMessages() {
		return this.client.request<{ items: QuickCustomerConversation[] }>(
			"/customer/messages",
		);
	}

	getMessage(id: string) {
		return this.client.request<
			QuickCustomerConversation & { messages: unknown[] }
		>(`/customer/messages/${encodeURIComponent(id)}`);
	}

	createMessage(subject: string, body: string) {
		return this.client.request<QuickCustomerConversation>(
			"/customer/messages",
			{
				method: "POST",
				body: { subject, body },
			},
		);
	}

	replyToMessage(id: string, body: string) {
		return this.client.request(
			`/customer/messages/${encodeURIComponent(id)}/replies`,
			{ method: "POST", body: { body } },
		);
	}

	markMessageRead(id: string) {
		return this.client.request<{ read: true }>(
			`/customer/messages/${encodeURIComponent(id)}/read`,
			{ method: "POST" },
		);
	}
}
