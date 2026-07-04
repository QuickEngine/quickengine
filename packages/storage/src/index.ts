export type StorageBucket = "avatars" | "documents" | "exports" | "uploads";

export type PutObjectInput = {
	bucket: StorageBucket;
	key: string;
	body: Blob | Uint8Array | string;
	contentType?: string;
	metadata?: Record<string, string>;
};

export type StoredObject = {
	bucket: StorageBucket;
	key: string;
	url: string;
	contentType?: string;
	size?: number;
};

export type StorageProvider = {
	put(input: PutObjectInput): Promise<StoredObject>;
	delete(bucket: StorageBucket, key: string): Promise<void>;
	getPublicUrl(bucket: StorageBucket, key: string): string;
};

export const createLocalStorageProvider = (baseUrl = "http://localhost:3001") =>
	({
		async put(input) {
			return {
				bucket: input.bucket,
				key: input.key,
				url: this.getPublicUrl(input.bucket, input.key),
				contentType: input.contentType,
			};
		},
		async delete() {},
		getPublicUrl(bucket, key) {
			return `${baseUrl}/storage/${bucket}/${key}`;
		},
	}) satisfies StorageProvider;
