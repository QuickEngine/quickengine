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

/**
 * Where local development keeps public assets on disk.
 *
 * 🔴 Outside the repository by default. These are real uploaded files — a
 * customer's product photographs while testing — and writing them under the
 * working tree invites them into a commit.
 */
export function localAssetRoot(): string {
	return (
		process.env.LOCAL_ASSET_DIR ??
		`${process.env.TMPDIR?.replace(/\/$/, "") ?? "/tmp"}/quickengine-assets`
	);
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

			/**
			 * 🔴 The bytes are actually WRITTEN. This used to hash them, return a
			 * URL and discard the file, so every local upload reported success and
			 * produced a permanently broken image — and nothing served the returned
			 * address either. A development stub that silently loses the thing it
			 * was given is worse than one that refuses.
			 *
			 * Imported inside the function so `node:fs` never enters the module
			 * graph of route registration or of any browser bundle.
			 */
			const { mkdir, writeFile } = await import("node:fs/promises");
			const { dirname, join } = await import("node:path");
			const file = join(localAssetRoot(), path);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, bytes);

			return {
				provider: this.name,
				bucket: PUBLIC_BUCKET,
				key: `${input.workspaceId}/${input.key}`,
				// Served back by the API's own development asset route, which reads
				// the same directory.
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
			const { rm } = await import("node:fs/promises");
			const { join } = await import("node:path");
			// Missing is success: the caller wants it gone, and it is.
			await rm(join(localAssetRoot(), PUBLIC_BUCKET, asset.key), {
				force: true,
			});
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

export type R2StorageProviderOptions = {
	/** `https://<account>.r2.cloudflarestorage.com` — no bucket in the path. */
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	/** Private objects. Public access MUST be off on this bucket. */
	bucket: string;
	/** Public web assets. Public access is on, served from `publicBaseUrl`. */
	publicBucket: string;
	/** e.g. `https://pub-xxxx.r2.dev`, or a custom domain later. */
	publicBaseUrl: string;
};

/**
 * Cloudflare R2, through the S3-compatible API.
 *
 * ── Why two buckets rather than one ──────────────────────────────────────────
 *
 * 🔴 A signed contract and a product photograph are both "a file the workspace
 * uploaded". The only thing keeping them apart is that they live in different
 * buckets with different public-access settings — not a flag on a call, which is
 * a thing somebody eventually passes wrongly. The private bucket must have
 * public access DISABLED; if that is ever switched on, every stored document
 * becomes world-readable and nothing in this code would notice.
 *
 * ── Why aws4fetch and not the AWS SDK ────────────────────────────────────────
 *
 * 🔑 About five kilobytes against several megabytes, on a runtime that pays for
 * every cold start. It signs with SigV4 and presigns query URLs, which is the
 * entire surface this provider needs.
 *
 * ── Why our own checksum ─────────────────────────────────────────────────────
 *
 * ⚠️ The provider's ETag is NOT a content hash once an upload is multipart, so a
 * caller comparing it against a re-computed sha256 would see spurious
 * mismatches on exactly the large files that matter most. The hash returned here
 * is always computed from the bytes we sent.
 */
export function createR2StorageProvider(
	options: R2StorageProviderOptions,
): StorageProvider {
	const name = "r2";
	const base = options.endpoint.replace(/\/$/, "");
	const publicBase = options.publicBaseUrl.replace(/\/$/, "");

	// Lazily imported so the signer never enters the module graph of route
	// registration (hard rule 12).
	const client = async () => {
		const { AwsClient } = await import("aws4fetch");
		return new AwsClient({
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey,
			// R2 has no regions; "auto" is what Cloudflare's own docs sign with.
			region: "auto",
			service: "s3",
		});
	};

	const objectUrl = (bucket: string, path: string) =>
		`${base}/${bucket}/${path
			.split("/")
			.map((segment) => encodeURIComponent(segment))
			.join("/")}`;

	async function upload(
		bucket: string,
		path: string,
		bytes: Uint8Array,
		contentType?: string,
	) {
		const body = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(body).set(bytes);
		const aws = await client();
		const response = await aws.fetch(objectUrl(bucket, path), {
			method: "PUT",
			body,
			headers: contentType ? { "content-type": contentType } : undefined,
		});
		if (!response.ok) {
			throw new Error(
				`STORAGE_PUT_FAILED_${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
	}

	async function remove(bucket: string, path: string) {
		const aws = await client();
		const response = await aws.fetch(objectUrl(bucket, path), {
			method: "DELETE",
		});
		/**
		 * ⚠️ 404 is SUCCESS here. Cleanup jobs retry after an interrupted run, and
		 * the caller wants the object gone — which it is. Treating "already absent"
		 * as a failure would leave those jobs retrying for ever.
		 */
		if (!response.ok && response.status !== 404) {
			throw new Error(
				`STORAGE_DELETE_FAILED_${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}
	}

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
			await upload(options.bucket, blobPath(locator), bytes, input.contentType);
			return {
				...locator,
				contentType: input.contentType,
				size: bytes.byteLength,
				checksumSha256: await sha256(bytes),
			};
		},

		async putPublicAsset(input) {
			const path = publicAssetPath(input.workspaceId, input.key);
			const bytes = await bodyBytes(input.body);
			await upload(options.publicBucket, path, bytes, input.contentType);
			return {
				provider: name,
				bucket: PUBLIC_BUCKET,
				key: `${input.workspaceId}/${input.key}`,
				/**
				 * 🔴 A DURABLE url, and deliberately not a signed one. This is written
				 * into a catalog item and served from a customer's own website, where
				 * an `<img src>` cannot re-authorize itself every five minutes. Re-
				 * uploading a corrected photograph overwrites in place rather than
				 * minting a new address that orphans the one already published.
				 */
				url: `${publicBase}/${path}`,
				contentType: input.contentType,
				size: bytes.byteLength,
				checksumSha256: await sha256(bytes),
			};
		},

		async deletePublicAsset(asset) {
			if (asset.provider !== name) {
				throw new Error("STORAGE_PROVIDER_MISMATCH");
			}
			await remove(options.publicBucket, `${PUBLIC_BUCKET}/${asset.key}`);
		},

		async delete(locator) {
			assertLocator(locator, name);
			await remove(options.bucket, blobPath(locator));
		},

		async createDownloadAccess(locator, downloadOptions = {}) {
			assertLocator(locator, name);
			const expiresInSeconds = downloadOptions.expiresInSeconds ?? 300;
			// Same bounds the Vercel provider enforces, so switching providers
			// cannot quietly widen how long a link stays valid.
			if (expiresInSeconds < 30 || expiresInSeconds > 3_600) {
				throw new Error("STORAGE_DOWNLOAD_EXPIRY_INVALID");
			}
			const aws = await client();
			const url = new URL(objectUrl(options.bucket, blobPath(locator)));
			// aws4fetch reads the expiry from the query string when presigning.
			url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
			const signed = await aws.sign(url.toString(), {
				method: "GET",
				aws: { signQuery: true },
			});
			return {
				url: signed.url,
				expiresAt: new Date(Date.now() + expiresInSeconds * 1_000),
			};
		},
	};
}

/**
 * Which provider a deployment actually uses.
 *
 * ── Why this is one function and not three ───────────────────────────────────
 *
 * 🔴 The choice was made independently in `quickdash-routes.ts`,
 * `products-services-routes.ts` and `storage-cleanup.ts`. Three copies of a
 * precedence rule drift, and the way this one drifts is silent: writes go to the
 * new provider while cleanup still resolves the old one, so deleted documents
 * leave their bytes behind for ever and the storage bill never goes down.
 *
 * ── Precedence ──────────────────────────────────────────────────────────────
 *
 * R2 when configured, then Vercel Blob, then local disk. R2 first because it is
 * where new writes are meant to go; Blob remains reachable so objects written
 * before the switch still resolve.
 */
export function storageProviderFromEnv(
	origin: string,
	env: Record<string, string | undefined> = process.env,
): StorageProvider {
	if (
		env.R2_ENDPOINT &&
		env.R2_ACCESS_KEY_ID &&
		env.R2_SECRET_ACCESS_KEY &&
		env.R2_BUCKET
	) {
		return createR2StorageProvider({
			endpoint: env.R2_ENDPOINT,
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY,
			bucket: env.R2_BUCKET,
			publicBucket: env.R2_PUBLIC_BUCKET ?? env.R2_BUCKET,
			publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? origin,
		});
	}
	if (env.BLOB_READ_WRITE_TOKEN) {
		return createVercelBlobStorageProvider({
			token: env.BLOB_READ_WRITE_TOKEN,
			storeId: env.BLOB_STORE_ID,
		});
	}
	return createLocalStorageProvider(origin);
}

/**
 * The provider for things the public web reads.
 *
 * ⚠️ Separate from the private one because Vercel Blob fixes public/private per
 * STORE, so the two need different credentials there. R2 draws the same line
 * with two buckets, which is why one R2 provider answers both — the split is in
 * `bucket` versus `publicBucket`, not in a flag a caller could pass wrongly.
 */
export function publicAssetProviderFromEnv(
	origin: string,
	env: Record<string, string | undefined> = process.env,
): StorageProvider {
	if (
		env.R2_ENDPOINT &&
		env.R2_ACCESS_KEY_ID &&
		env.R2_SECRET_ACCESS_KEY &&
		env.R2_PUBLIC_BUCKET &&
		env.R2_PUBLIC_BASE_URL
	) {
		return createR2StorageProvider({
			endpoint: env.R2_ENDPOINT,
			accessKeyId: env.R2_ACCESS_KEY_ID,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY,
			bucket: env.R2_BUCKET ?? env.R2_PUBLIC_BUCKET,
			publicBucket: env.R2_PUBLIC_BUCKET,
			publicBaseUrl: env.R2_PUBLIC_BASE_URL,
		});
	}
	if (env.PUBLIC_BLOB_READ_WRITE_TOKEN || env.PUBLIC_BLOB_STORE_ID) {
		return createVercelBlobStorageProvider({
			token: env.PUBLIC_BLOB_READ_WRITE_TOKEN,
			oidcToken: env.VERCEL_OIDC_TOKEN,
			storeId: env.PUBLIC_BLOB_STORE_ID,
		});
	}
	return createLocalStorageProvider(origin);
}

/**
 * The provider a STORED object belongs to, by the name recorded beside it.
 *
 * 🔴 This is what makes the migration gradual. An object written to Vercel Blob
 * keeps resolving through the Vercel provider after new writes have moved to R2,
 * so nothing needs copying, no historical row needs rewriting, and there is no
 * moment where a download breaks. Resolving by ASSUMPTION instead would delete
 * the wrong thing, or nothing at all.
 */
export function resolveStorageProviderByName(
	name: string,
	origin: string,
	env: Record<string, string | undefined> = process.env,
): StorageProvider | undefined {
	for (const candidate of [
		storageProviderFromEnv(origin, env),
		publicAssetProviderFromEnv(origin, env),
	]) {
		if (candidate.name === name) return candidate;
	}
	// Blob may no longer be the configured provider while its objects remain.
	if (name === "vercel-blob" && env.BLOB_READ_WRITE_TOKEN) {
		return createVercelBlobStorageProvider({
			token: env.BLOB_READ_WRITE_TOKEN,
			storeId: env.BLOB_STORE_ID,
		});
	}
	if (name === "local") return createLocalStorageProvider(origin);
	return undefined;
}
