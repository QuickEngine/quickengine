export const WORKSPACE_CHANNEL_PREFIX = "private-workspace-";

export function workspaceChannel(workspaceId: string): string {
	return `${WORKSPACE_CHANNEL_PREFIX}${workspaceId}`;
}

export function parseWorkspaceChannel(channel: string): string | null {
	if (!channel.startsWith(WORKSPACE_CHANNEL_PREFIX)) return null;
	const workspaceId = channel.slice(WORKSPACE_CHANNEL_PREFIX.length);
	return workspaceId.length > 0 ? workspaceId : null;
}

/**
 * The public catalog channel a storefront listens on.
 *
 * 🔴 This one is PUBLIC, and that is the whole design constraint. Pusher only
 * authorizes a `private-` channel, and a storefront has no session to authorize
 * with: its visitors are strangers. So anybody who knows a workspace id, which
 * is public already since every storefront ships it to the browser, can
 * subscribe to this.
 *
 * That is safe only because of what goes over it. The payload is an id and a
 * record id, never a name, price or stock figure, and the storefront answers by
 * refetching through the public catalog API, which returns published items only.
 * A draft product's event is therefore inert: the refetch it triggers returns
 * nothing new. Keep it that way. Anything carrying customer, order or payment
 * detail belongs on the private workspace channel and nowhere near this one.
 */
export const CATALOG_CHANNEL_PREFIX = "catalog-workspace-";

export function catalogChannel(workspaceId: string): string {
	return `${CATALOG_CHANNEL_PREFIX}${workspaceId}`;
}

export function parseCatalogChannel(channel: string): string | null {
	if (!channel.startsWith(CATALOG_CHANNEL_PREFIX)) return null;
	const workspaceId = channel.slice(CATALOG_CHANNEL_PREFIX.length);
	return workspaceId.length > 0 ? workspaceId : null;
}

/**
 * The only events that may cross the public channel.
 *
 * An allowlist rather than a denylist on purpose: a new event name added
 * anywhere in the product is private until somebody deliberately puts it here,
 * so forgetting to think about this file fails closed.
 */
export const PUBLIC_CATALOG_EVENTS = new Set([
	"catalog-item.created",
	"catalog-item.updated",
	"catalog-item.deleted",
	"catalog-item.status-changed",
	"inventory-item.adjusted",
	"inventory-item.updated",
	"inventory-item.status-changed",
]);

export function isPublicCatalogEvent(eventName: string): boolean {
	return PUBLIC_CATALOG_EVENTS.has(eventName);
}
