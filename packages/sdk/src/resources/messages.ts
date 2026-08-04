import type { QuickClient } from "../client";

export type CustomerConversation = {
	id: string;
	workspaceCustomerId: string;
	clientRecordId: string | null;
	clientName: string | null;
	customerEmail: string;
	subject: string;
	status: "open" | "closed";
	lastMessageAt: string;
};

export class MessagesResource {
	constructor(private readonly client: QuickClient) {}

	list() {
		return this.client.request<{ items: CustomerConversation[] }>(
			"/customer-conversations",
		);
	}

	get(id: string) {
		return this.client.request<CustomerConversation & { messages: unknown[] }>(
			`/customer-conversations/${id}`,
		);
	}

	create(input: {
		workspaceCustomerId?: string;
		clientRecordId?: string;
		subject: string;
		body: string;
	}) {
		return this.client.request<CustomerConversation>(
			"/customer-conversations",
			{ method: "POST", body: input },
		);
	}

	reply(id: string, body: string) {
		return this.client.request(`/customer-conversations/${id}/messages`, {
			method: "POST",
			body: { body },
		});
	}

	markRead(id: string) {
		return this.client.request<{ read: boolean }>(
			`/customer-conversations/${id}/read`,
			{ method: "POST" },
		);
	}

	setStatus(id: string, status: "open" | "closed") {
		return this.client.request<CustomerConversation>(
			`/customer-conversations/${id}`,
			{ method: "PATCH", body: { status } },
		);
	}
}
