import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Address4, Address6 } from "ip-address";

export const WEBHOOK_URL_ERRORS = {
	invalid: "WEBHOOK_URL_INVALID",
	insecure: "WEBHOOK_URL_INSECURE",
	private: "WEBHOOK_URL_PRIVATE",
	unresolvable: "WEBHOOK_URL_UNRESOLVABLE",
} as const;

export type WebhookAddress = { address: string; family: 4 | 6 };
export type WebhookResolver = (hostname: string) => Promise<WebhookAddress[]>;

const IPV4_NON_PUBLIC = [
	"0.0.0.0/8",
	"10.0.0.0/8",
	"100.64.0.0/10",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"172.16.0.0/12",
	"192.0.0.0/24",
	"192.0.2.0/24",
	"192.88.99.0/24",
	"192.168.0.0/16",
	"198.18.0.0/15",
	"198.51.100.0/24",
	"203.0.113.0/24",
	"224.0.0.0/4",
	"240.0.0.0/4",
].map((cidr) => new Address4(cidr));

const IPV6_NON_PUBLIC = [
	"::/128",
	"::1/128",
	"100::/64",
	"2001::/32",
	"2001:2::/48",
	"2001:db8::/32",
	"2002::/16",
	"fc00::/7",
	"fe80::/10",
	"ff00::/8",
].map((cidr) => new Address6(cidr));
const IPV4_MAPPED_IPV6 = new Address6("::ffff:0:0/96");

const hostnameWithoutBrackets = (hostname: string) =>
	hostname.startsWith("[") && hostname.endsWith("]")
		? hostname.slice(1, -1)
		: hostname;

export function isPublicWebhookAddress(value: string): boolean {
	if (Address4.isValid(value)) {
		const address = new Address4(value);
		return !IPV4_NON_PUBLIC.some((range) => address.isInSubnet(range));
	}
	if (!Address6.isValid(value)) return false;
	const address = new Address6(value);
	// URL parsing may canonicalize ::ffff:127.0.0.1 into ::ffff:7f00:1,
	// which some parsers no longer report as `is4()`. Refuse the whole mapped
	// range rather than let representation choose the security result.
	if (address.isInSubnet(IPV4_MAPPED_IPV6)) return false;
	if (address.is4()) return isPublicWebhookAddress(address.to4().correctForm());
	return !IPV6_NON_PUBLIC.some((range) => address.isInSubnet(range));
}

/**
 * Reject destinations that can never be safe without touching DNS. Delivery
 * repeats this check against every resolved address immediately before sending.
 */
export function parseWebhookUrl(value: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(WEBHOOK_URL_ERRORS.invalid);
	}
	if (parsed.protocol !== "https:") {
		throw new Error(WEBHOOK_URL_ERRORS.insecure);
	}
	if (parsed.username || parsed.password || !parsed.hostname) {
		throw new Error(WEBHOOK_URL_ERRORS.invalid);
	}

	const hostname = hostnameWithoutBrackets(parsed.hostname).toLowerCase();
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal")
	) {
		throw new Error(WEBHOOK_URL_ERRORS.private);
	}
	if (isIP(hostname) !== 0 && !isPublicWebhookAddress(hostname)) {
		throw new Error(WEBHOOK_URL_ERRORS.private);
	}
	return parsed;
}

export const systemWebhookResolver: WebhookResolver = async (hostname) =>
	(await lookup(hostname, { all: true, verbatim: true })).map((result) => ({
		address: result.address,
		family: result.family as 4 | 6,
	}));

/**
 * Every DNS answer must be public. Accepting one public answer among private
 * ones leaves resolution order as an SSRF bypass.
 */
export async function resolvePublicWebhookDestination(
	value: string,
	resolver: WebhookResolver = systemWebhookResolver,
): Promise<{ url: URL; address: WebhookAddress }> {
	const url = parseWebhookUrl(value);
	const hostname = hostnameWithoutBrackets(url.hostname);
	const literalFamily = isIP(hostname);
	const addresses = literalFamily
		? [{ address: hostname, family: literalFamily as 4 | 6 }]
		: await resolver(hostname).catch(() => []);

	if (addresses.length === 0) {
		throw new Error(WEBHOOK_URL_ERRORS.unresolvable);
	}
	if (addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
		throw new Error(WEBHOOK_URL_ERRORS.private);
	}
	return { url, address: addresses[0] };
}
