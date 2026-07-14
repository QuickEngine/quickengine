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

export type StorageProvider = {
	readonly name: string;
	put(input: PutObjectInput): Promise<StoredObject>;
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
