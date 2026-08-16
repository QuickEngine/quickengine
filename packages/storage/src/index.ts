import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";

export type StorageBucket = "avatars" | "documents" | "exports" | "uploads";

export type StorageObjectLocator = {
	provider: string;
	bucket: StorageBucket;
	key: string;
};

export type PutObjectInput = {
	bucket: StorageBucket;
	key: string;
	body: Blob | Uint8Array | string;
	contentType?: string;
	metadata?: Record<string, string>;
};

export type StoredObject = StorageObjectLocator & {
	contentType?: string;
	size: number;
	checksumSha256: string;
};

export type DownloadAccess = {
	url: string;
	expiresAt: Date;
};

/**
 * The one bucket whose objects are world-readable.
 *
 * 🔴 Deliberately NOT a member of `StorageBucket`, and public writes go through
 * their own method. A product photo and a signed contract are both "a file the
 * workspace uploaded", and the only thing standing between them is that a caller
 * cannot reach the public path without naming it — there is no `access` flag to
 * pass wrongly, and no bucket string that can be swapped for another.
 *
 * A public asset is something the business has chosen to put on its own website:
 * catalog images, a logo, a favicon. Everything else stays private and is read
 * through short-lived signed URLs after authorization.
 */
export type PublicAssetBucket = "assets";

export type PutPublicAssetInput = {
	/**
	 * Whose asset this is.
	 *
	 * 🔴 Prefixed into the key rather than trusted from it. Public objects share
	 * one flat namespace, so without this one workspace could overwrite another's
	 * product photograph by choosing the same key.
	 */
	workspaceId: string;
	key: string;
	body: Blob | Uint8Array | string;
	contentType?: string;
};

/**
 * A stored public asset.
 *
 * Unlike `StoredObject` this carries a `url`, because a durable public URL is
 * the entire reason the bucket exists — an `<img src>` cannot re-authorize
 * itself every five minutes.
 */
export type PublicAsset = {
	provider: string;
	bucket: PublicAssetBucket;
	key: string;
	url: string;
	contentType?: string;
	size: number;
	checksumSha256: string;
};

/**
 * The storage seam.
 *
 * Three methods. Two implementations today (local, Vercel Blob) and only three
 * files in the whole repository import this package, so swapping providers is a
 * genuinely small job rather than a nominal one.
 *
 * ── Adding S3 (or R2, or GCS) ──────────────────────────────────────────────
 *
 * One new file implementing these three methods, plus a line wherever the
 * provider is chosen. Nothing in `mod-files`, `event-dispatch` or the API
 * changes. Concretely:
 *
 * 1. `put` → `PutObjectCommand`. Keep returning the sha256 this module already
 *    computes; do not trust the provider's ETag, which is not a content hash for
 *    multipart uploads.
 * 2. `delete` → `DeleteObjectCommand`. Must stay safe to repeat: cleanup jobs
 *    retry after an interrupted run, and S3 already answers 204 for a key that is
 *    not there.
 * 3. `createDownloadAccess` → `getSignedUrl`. Same short-lived-signed-URL model
 *    this interface already assumes, so there is no architectural mismatch.
 *
 * 🔴 `StorageObjectLocator` carries `provider`, and `assertLocator` refuses a
 * locator from a different one. That is what makes a migration GRADUAL: objects
 * written to Vercel Blob keep resolving through the Vercel provider while new
 * ones go to S3. No big-bang copy, no downtime, and no rewriting historical rows.
 *
 * The real work is operational, not code: bucket policy, IAM, CORS for browser
 * uploads, and a lifecycle rule if cold storage is wanted.
 *
 * ⚠️ Deliberately NOT written until something needs it. An unreachable provider
 * is the exact failure the 2026-08-03 audit spent a night cataloguing — code that
 * reads as finished and is called by nothing.
 */
export type StorageProvider = {
	readonly name: string;
	put(input: PutObjectInput): Promise<StoredObject>;
	/**
	 * Write something the public web is meant to read.
	 *
	 * Separate from `put` on purpose — see `PublicAssetBucket`. Returns the
	 * durable URL that `put` deliberately discards.
	 */
	putPublicAsset(input: PutPublicAssetInput): Promise<PublicAsset>;
	/** Safe to repeat, for the same reason `delete` is. */
	deletePublicAsset(
		asset: Pick<PublicAsset, "provider" | "key">,
	): Promise<void>;
	// Deletion must be safe to repeat so durable cleanup jobs can retry after an
	// interrupted run without leaving database metadata or provider objects behind.
	delete(locator: StorageObjectLocator): Promise<void>;
	// Production providers return a short-lived signed URL. The application must
	// authorize the workspace/document before this method is ever called.
	createDownloadAccess(
		locator: StorageObjectLocator,
		options?: { expiresInSeconds?: number },
	): Promise<DownloadAccess>;
};

async function bodyBytes(body: PutObjectInput["body"]): Promise<Uint8Array> {
	if (typeof body === "string") return new TextEncoder().encode(body);
	if (body instanceof Uint8Array) {
		const copy = new Uint8Array(body.byteLength);
		copy.set(body);
		return copy;
	}
	return new Uint8Array(await body.arrayBuffer());
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function assertLocator(locator: StorageObjectLocator, provider: string) {
	if (locator.provider !== provider) {
		throw new Error("STORAGE_PROVIDER_MISMATCH");
	}
	const segments = locator.key.split("/");
	if (
		locator.key.length === 0 ||
		locator.key.startsWith("/") ||
		segments.some((segment) => segment.length === 0 || segment === "..")
	) {
		throw new Error("STORAGE_KEY_INVALID");
	}
}

function blobPath(locator: Pick<StorageObjectLocator, "bucket" | "key">) {
	return `${locator.bucket}/${locator.key}`;
}

const PUBLIC_BUCKET: PublicAssetBucket = "assets";

/**
 * Where a public asset lives: `assets/<workspaceId>/<key>`.
 *
 * 🔴 The workspace segment is built here from the validated id, never taken from
 * the caller's key — a key of `../other-workspace/logo.png` must not be able to
 * climb out, which is why the same segment rules as `assertLocator` apply and a
 * workspace id containing a slash is refused outright.
 */
function publicAssetPath(workspaceId: string, key: string) {
	if (
		workspaceId.length === 0 ||
		workspaceId.includes("/") ||
		workspaceId === ".." ||
		workspaceId === "."
	) {
		throw new Error("STORAGE_WORKSPACE_INVALID");
	}
	const segments = key.split("/");
	if (
		key.length === 0 ||
		key.startsWith("/") ||
		segments.some((segment) => segment.length === 0 || segment === "..")
	) {
		throw new Error("STORAGE_KEY_INVALID");
	}
	return `${PUBLIC_BUCKET}/${workspaceId}/${key}`;
}

export const createLocalStorageProvider = (baseUrl = "http://localhost:3001") =>
	({
		name: "local",
		async put(input) {
			const bytes = await bodyBytes(input.body);
			return {
				provider: this.name,
				bucket: input.bucket,
				key: input.key,
				contentType: input.contentType,
				size: bytes.byteLength,
				checksumSha256: await sha256(bytes),
			};
		},
		async putPublicAsset(input) {
			const path = publicAssetPath(input.workspaceId, input.key);
			const bytes = await bodyBytes(input.body);
			return {
				provider: this.name,
				bucket: PUBLIC_BUCKET,
				key: `${input.workspaceId}/${input.key}`,
				// Local development serves these from the account app, the same way
				// `createDownloadAccess` does. Durable in the only sense that matters
				// here: stable for as long as the dev server runs.
				url: `${baseUrl}/${path}`,
				contentType: input.contentType,
				size: bytes.byteLength,
				checksumSha256: await sha256(bytes),
			};
		},
		async deletePublicAsset(asset) {
			if (asset.provider !== this.name) {
				throw new Error("STORAGE_PROVIDER_MISMATCH");
			}
		},
		async delete(locator) {
			assertLocator(locator, this.name);
		},
		async createDownloadAccess(locator, options = {}) {
			assertLocator(locator, this.name);
			const expiresAt = new Date(
				Date.now() + (options.expiresInSeconds ?? 300) * 1_000,
			);
			const path = locator.key
				.split("/")
				.map((part) => encodeURIComponent(part))
				.join("/");
			return {
				// This is an authenticated application route in local development, not a
				// durable object URL. Production adapters must sign their URL instead.
				url: `${baseUrl}/storage/${locator.bucket}/${path}`,
				expiresAt,
			};
		},
	}) satisfies StorageProvider;

export type VercelBlobStorageProviderOptions = {
	token?: string;
	oidcToken?: string;
	storeId?: string;
};

/**
 * Private production storage. The durable public-looking URLs returned by Blob
 * writes are deliberately discarded; callers receive only an opaque locator,
 * and reads are granted through short-lived signed URLs after authorization.
 */
export function createVercelBlobStorageProvider(
	options: VercelBlobStorageProviderOptions = {},
): StorageProvider {
	const name = "vercel-blob";
	const credentials = {
		token: options.token,
		oidcToken: options.oidcToken,
		storeId: options.storeId,
	};
	return {
		name,
		async put(input) {
			const locator = {
				provider: name,
				bucket: input.bucket,
				key: input.key,
			} satisfies StorageObjectLocator;
			assertLocator(locator, name);
			const bytes = await bodyBytes(input.body);
			const uploadBody = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(uploadBody).set(bytes);
			const stored = await put(blobPath(locator), uploadBody, {
				...credentials,
				access: "private",
				addRandomSuffix: false,
				allowOverwrite: true,
				contentType: input.contentType,
				maximumSizeInBytes: bytes.byteLength,
				multipart: bytes.byteLength >= 5 * 1024 * 1024,
			});
			if (stored.pathname !== blobPath(locator)) {
				throw new Error("STORAGE_PATH_MISMATCH");
			}
			return {
				...locator,
				contentType: stored.contentType,
				size: bytes.byteLength,
				checksumSha256: await sha256(bytes),
			};
		},
		async putPublicAsset(input) {
			const path = publicAssetPath(input.workspaceId, input.key);
			const bytes = await bodyBytes(input.body);
			const uploadBody = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(uploadBody).set(bytes);
			const stored = await put(path, uploadBody, {
				...credentials,
				access: "public",
				// 🔴 The URL is written into a catalog item's metadata and served from
				// a customer's own website. A random suffix would mint a NEW url on
				// every re-upload and silently orphan the one already published, so
				// re-uploading a corrected photograph must overwrite in place.
				addRandomSuffix: false,
				allowOverwrite: true,
				contentType: input.contentType,
				maximumSizeInBytes: bytes.byteLength,
				multipart: bytes.byteLength >= 5 * 1024 * 1024,
			});
			if (stored.pathname !== path) {
				throw new Error("STORAGE_PATH_MISMATCH");
			}
			return {
				provider: name,
				bucket: PUBLIC_BUCKET,
				key: `${input.workspaceId}/${input.key}`,
				url: stored.url,
				contentType: stored.contentType,
				size: bytes.byteLength,
				checksumSha256: await sha256(bytes),
			};
		},
		async deletePublicAsset(asset) {
			if (asset.provider !== name) {
				throw new Error("STORAGE_PROVIDER_MISMATCH");
			}
			await del(`${PUBLIC_BUCKET}/${asset.key}`, credentials);
		},
		async delete(locator) {
			assertLocator(locator, name);
			await del(blobPath(locator), credentials);
		},
		async createDownloadAccess(locator, downloadOptions = {}) {
			assertLocator(locator, name);
			const expiresInSeconds = downloadOptions.expiresInSeconds ?? 300;
			if (expiresInSeconds < 30 || expiresInSeconds > 3_600) {
				throw new Error("STORAGE_DOWNLOAD_EXPIRY_INVALID");
			}
			const pathname = blobPath(locator);
			const requestedExpiry = Date.now() + expiresInSeconds * 1_000;
			const signedToken = await issueSignedToken({
				...credentials,
				pathname,
				operations: ["get"],
				validUntil: requestedExpiry,
			});
			const { presignedUrl } = await presignUrl(signedToken, {
				access: "private",
				operation: "get",
				pathname,
				validUntil: signedToken.validUntil,
				useCache: true,
			});
			return {
				url: presignedUrl,
				expiresAt: new Date(signedToken.validUntil),
			};
		},
	};
}
