import { readApiError } from "./error";
import { ActivityResource } from "./resources/activity";
import { BookingsResource } from "./resources/bookings";
import { CatalogResource } from "./resources/catalog";
import { ClientsResource } from "./resources/clients";
import { ContractsResource } from "./resources/contracts";
import { EventsResource } from "./resources/events";
import { FilesResource } from "./resources/files";
import { FulfillmentsResource } from "./resources/fulfillments";
import { InventoryResource } from "./resources/inventory";
import { InvoicesResource } from "./resources/invoices";
import { MessagesResource } from "./resources/messages";
import { OrdersResource } from "./resources/orders";
import { PaymentsResource } from "./resources/payments";
import { ProjectsResource } from "./resources/projects";
import { QuotesResource } from "./resources/quotes";
import { ReportsResource } from "./resources/reports";
import { ShipmentsResource } from "./resources/shipments";
import { CustomerResource, SiteResource } from "./resources/site";
import { TimeResource } from "./resources/time";
import { WebhooksResource } from "./resources/webhooks";
import type {
	QuickClientConstructorOptions,
	QuickCredential,
	QuickRequestOptions,
	QuickResponse,
} from "./types";

const cleanSegment = (value: string, label: string) => {
	const cleaned = value.trim().replace(/^\/+|\/+$/g, "");
	if (!cleaned) {
		throw new TypeError(`${label} is required`);
	}
	return cleaned;
};

const cleanBaseUrl = (value: string) => {
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new TypeError("baseUrl must use HTTP or HTTPS");
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new TypeError(
			"baseUrl cannot include credentials, a query, or a fragment",
		);
	}
	return url.toString().replace(/\/$/, "");
};

const cleanPath = (path: string) => {
	if (!path.startsWith("/") || path.startsWith("//")) {
		throw new TypeError("Quick.js request paths must be root-relative");
	}
	return path;
};

const credentialHeaders = (credential: QuickCredential): HeadersInit => {
	switch (credential.type) {
		case "secret":
		case "scoped":
			return {
				Authorization: `Bearer ${cleanSegment(credential.token, "token")}`,
			};
		case "publishable":
		case "site":
			return {
				"QuickEngine-Publishable-Key": cleanSegment(credential.key, "key"),
				...(credential.type === "site" && credential.customerSession
					? {
							"QuickEngine-Customer-Session": cleanSegment(
								credential.customerSession,
								"customerSession",
							),
						}
					: {}),
			};
		case "session":
			return {};
		case "bearer":
			// The same session token a cookie would have carried. Better Auth's
			// `bearer()` plugin accepts it on any endpoint that accepts a session.
			return { Authorization: `Bearer ${credential.token}` };
	}
};

export class QuickClient {
	readonly baseUrl: string;
	readonly workspaceId: string | null;
	readonly apiVersion: string;
	/** Published catalog for the scoped workspace. */
	readonly catalog: CatalogResource;
	/** Privacy-minimal site telemetry for the scoped workspace. */
	readonly events: EventsResource;
	readonly clients: ClientsResource;
	readonly quotes: QuotesResource;
	readonly invoices: InvoicesResource;
	readonly messages: MessagesResource;
	readonly payments: PaymentsResource;
	readonly orders: OrdersResource;
	readonly fulfillments: FulfillmentsResource;
	readonly inventory: InventoryResource;
	readonly shipments: ShipmentsResource;
	readonly projects: ProjectsResource;
	readonly bookings: BookingsResource;
	readonly time: TimeResource;
	readonly contracts: ContractsResource;
	readonly files: FilesResource;
	readonly activity: ActivityResource;
	readonly reports: ReportsResource;
	readonly webhooks: WebhooksResource;
	/** Public catalog, checkout, content, and navigation for a custom site. */
	readonly site: SiteResource;
	/** The signed-in end customer's own records and portal actions. */
	readonly customer: CustomerResource;
	private readonly credential: QuickCredential;
	private readonly fetcher: typeof fetch;

	constructor(options: QuickClientConstructorOptions) {
		this.baseUrl = cleanBaseUrl(options.baseUrl);
		this.workspaceId = options.workspaceId
			? cleanSegment(options.workspaceId, "workspaceId")
			: null;
		// `bearer` is a session token carried explicitly, so it reaches the same
		// account-scoped endpoints without a workspace.
		if (
			!this.workspaceId &&
			options.credential.type !== "session" &&
			options.credential.type !== "bearer"
		) {
			throw new TypeError("workspaceId is required");
		}
		this.apiVersion = cleanSegment(options.apiVersion ?? "v1", "apiVersion");
		this.credential = options.credential;
		this.fetcher =
			options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
		this.catalog = new CatalogResource(this);
		this.events = new EventsResource(this);
		this.clients = new ClientsResource(this);
		this.quotes = new QuotesResource(this);
		this.invoices = new InvoicesResource(this);
		this.messages = new MessagesResource(this);
		this.payments = new PaymentsResource(this);
		this.orders = new OrdersResource(this);
		this.fulfillments = new FulfillmentsResource(this);
		this.inventory = new InventoryResource(this);
		this.shipments = new ShipmentsResource(this);
		this.projects = new ProjectsResource(this);
		this.bookings = new BookingsResource(this);
		this.time = new TimeResource(this);
		this.contracts = new ContractsResource(this);
		this.files = new FilesResource(this);
		this.activity = new ActivityResource(this);
		this.reports = new ReportsResource(this);
		this.webhooks = new WebhooksResource(this);
		this.site = new SiteResource(this);
		this.customer = new CustomerResource(this);
	}

	/**
	 * Low-level transport used by future typed module clients. Paths are confined to
	 * the configured QuickDash API origin and every call carries the workspace scope.
	 */
	async request<TData>(
		path: string,
		options: QuickRequestOptions = {},
	): Promise<QuickResponse<TData>> {
		const {
			body: requestBody,
			idempotencyKey,
			method = "GET",
			...requestInit
		} = options;
		const headers = new Headers(requestInit.headers);
		headers.set("Accept", "application/json");
		if (this.workspaceId) {
			headers.set("QuickEngine-Workspace", this.workspaceId);
		}

		for (const [name, value] of new Headers(
			credentialHeaders(this.credential),
		)) {
			headers.set(name, value);
		}

		if (idempotencyKey) {
			headers.set(
				"Idempotency-Key",
				cleanSegment(idempotencyKey, "idempotencyKey"),
			);
		}

		let body: BodyInit | undefined;
		if (requestBody !== undefined) {
			headers.set("Content-Type", "application/json");
			body = JSON.stringify(requestBody);
		}

		const response = await this.fetcher(
			`${this.baseUrl}/${this.apiVersion}${cleanPath(path)}`,
			{
				...requestInit,
				method,
				credentials:
					// `bearer` deliberately does NOT include cookies: the token is the
					// entire credential, and a native shell has no first-party cookie to
					// send anyway.
					this.credential.type === "session"
						? (requestInit.credentials ?? "include")
						: requestInit.credentials,
				headers,
				body,
			},
		);

		const requestId =
			response.headers.get("X-Request-Id") ??
			response.headers.get("Request-Id");
		if (!response.ok) {
			throw await readApiError(response, requestId);
		}

		if (response.status === 204) return { data: undefined as TData, requestId };
		const payload = (await response.json()) as
			| TData
			| { data: TData; meta?: { requestId?: string } };
		if (payload && typeof payload === "object" && "data" in payload) {
			return {
				data: payload.data,
				requestId: requestId ?? payload.meta?.requestId ?? null,
			};
		}
		return { data: payload as TData, requestId };
	}
}
