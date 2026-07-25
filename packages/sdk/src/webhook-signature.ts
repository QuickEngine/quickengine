import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies that a webhook request really came from QuickEngine.
 *
 * Do this on every request you receive. A webhook URL is not a secret — anyone
 * who learns it can POST to it — so the signature is the only thing that
 * distinguishes a genuine event from a forged one.
 *
 * ```ts
 * app.post("/hooks", async (req, res) => {
 *   const raw = await readRawBody(req); // the exact bytes, before JSON.parse
 *   if (!verifyWebhookSignature({
 *     secret: process.env.QUICKENGINE_WEBHOOK_SECRET,
 *     body: raw,
 *     header: req.headers["quickengine-signature"],
 *   })) return res.status(400).end();
 *   res.status(200).end(); // acknowledge fast, then process
 * });
 * ```
 *
 * Verify the **raw body**, byte for byte. Re-serializing parsed JSON can reorder
 * keys or change spacing, which changes the signature and fails verification.
 *
 * This is a deliberate copy of the server's implementation rather than a shared
 * import, so the SDK stays free of server dependencies. Both sides are pinned to
 * the same published test vector.
 */
export function verifyWebhookSignature(options: {
	/** The `whsec_…` value shown once when the endpoint was created. */
	secret: string;
	/** The raw request body, exactly as received. */
	body: string;
	/** The `QuickEngine-Signature` header value. */
	header: string | undefined | null;
	/** Reject requests older than this. Defaults to 5 minutes; 0 disables. */
	toleranceSeconds?: number;
	nowMs?: number;
}): boolean {
	const { secret, body, header, toleranceSeconds = 300 } = options;
	if (!header) return false;
	const nowMs = options.nowMs ?? Date.now();

	const parts = new Map(
		header.split(",").map((part) => {
			const [key, ...rest] = part.trim().split("=");
			return [key, rest.join("=")] as const;
		}),
	);
	const timestamp = Number(parts.get("t"));
	const provided = parts.get("v1");
	if (!Number.isFinite(timestamp) || !provided) return false;

	// The timestamp is part of the signed string, so an attacker replaying a
	// captured request cannot simply move it forward — that invalidates v1.
	if (toleranceSeconds > 0) {
		if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return false;
	}

	const expected = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
	const expectedBytes = Buffer.from(expected, "utf8");
	const providedBytes = Buffer.from(provided, "utf8");
	// Compare in constant time so the signature can't be guessed byte by byte.
	if (expectedBytes.length !== providedBytes.length) return false;
	return timingSafeEqual(expectedBytes, providedBytes);
}
