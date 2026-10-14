const ENVELOPE_VERSION = 1 as const;
const PBKDF2_ITERATIONS = 600_000;
const RSA_MODULUS_LENGTH = 3072;

export type RecipientPublicKey = {
	userId: string;
	key: RsaPublicKeyJwk;
};

export type RsaPublicKeyJwk = JsonWebKey & {
	kty: "RSA";
	n: string;
	e: string;
	alg: "RSA-OAEP-256";
	ext: boolean;
	key_ops: string[];
};

export type EncryptedPayload = {
	version: typeof ENVELOPE_VERSION;
	iv: string;
	ciphertext: string;
	encryptedKeys: Record<string, string>;
};

export type ProtectedPrivateKey = {
	version: typeof ENVELOPE_VERSION;
	kdf: "PBKDF2-SHA-256";
	iterations: 600_000;
	salt: string;
	iv: string;
	ciphertext: string;
};

const UNLOCKED_KEY_DATABASE = "spag-vault-session";
const UNLOCKED_KEY_STORE = "keys";

function openUnlockedKeyDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(UNLOCKED_KEY_DATABASE, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(UNLOCKED_KEY_STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("Unable to open the vault key store."));
	});
}

function unlockedKeyId(userId: string, sessionId: string) {
	return `${userId}:${sessionId}`;
}

export async function cacheSessionPrivateKey(
	userId: string,
	sessionId: string,
	privateKey: CryptoKey,
) {
	try {
		const database = await openUnlockedKeyDatabase();
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(UNLOCKED_KEY_STORE, "readwrite");
			transaction
				.objectStore(UNLOCKED_KEY_STORE)
				.put(privateKey, unlockedKeyId(userId, sessionId));
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(
					transaction.error ?? new Error("Unable to cache the vault key."),
				);
			transaction.onabort = () =>
				reject(
					transaction.error ?? new Error("Vault key caching was cancelled."),
				);
		});
		database.close();
		sessionStorage.setItem(`spag-vault-unlocked:${userId}`, sessionId);
	} catch {
		// Keep the vault usable when browser storage is unavailable.
	}
}

export async function getCachedSessionPrivateKey(
	userId: string,
	sessionId: string,
): Promise<CryptoKey | null> {
	try {
		if (sessionStorage.getItem(`spag-vault-unlocked:${userId}`) !== sessionId) {
			return null;
		}

		const database = await openUnlockedKeyDatabase();
		const privateKey = await new Promise<CryptoKey | undefined>(
			(resolve, reject) => {
				const transaction = database.transaction(
					UNLOCKED_KEY_STORE,
					"readonly",
				);
				const request = transaction
					.objectStore(UNLOCKED_KEY_STORE)
					.get(unlockedKeyId(userId, sessionId));
				request.onsuccess = () =>
					resolve(request.result as CryptoKey | undefined);
				request.onerror = () =>
					reject(
						request.error ?? new Error("Unable to load the cached vault key."),
					);
			},
		);
		database.close();
		return privateKey ?? null;
	} catch {
		sessionStorage.removeItem(`spag-vault-unlocked:${userId}`);
		return null;
	}
}

export async function clearCachedSessionPrivateKeys() {
	try {
		const database = await openUnlockedKeyDatabase();
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(UNLOCKED_KEY_STORE, "readwrite");
			transaction.objectStore(UNLOCKED_KEY_STORE).clear();
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(
					transaction.error ?? new Error("Unable to clear cached vault keys."),
				);
			transaction.onabort = () =>
				reject(
					transaction.error ?? new Error("Vault key cleanup was cancelled."),
				);
		});
		database.close();
	} catch {
		// Continue with the session marker cleanup if IndexedDB is unavailable.
	}

	try {
		for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
			const key = sessionStorage.key(index);
			if (key?.startsWith("spag-vault-unlocked:"))
				sessionStorage.removeItem(key);
		}
	} catch {
		// Browser storage may be disabled.
	}
}

function webCrypto(): Crypto {
	if (!globalThis.crypto?.subtle) {
		throw new Error("Web Crypto is unavailable in this environment.");
	}

	return globalThis.crypto;
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.slice().buffer;
}

function contextBytes(context: string): Uint8Array {
	return new TextEncoder().encode(context);
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array) {
	if (passphrase.length < 12) {
		throw new Error("The vault passphrase must be at least 12 characters.");
	}

	const crypto = webCrypto();
	const material = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(contextBytes(passphrase)),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt: toArrayBuffer(salt),
			iterations: PBKDF2_ITERATIONS,
		},
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export async function createUserEncryptionKeys(passphrase: string) {
	const crypto = webCrypto();
	const pair = await crypto.subtle.generateKey(
		{
			name: "RSA-OAEP",
			modulusLength: RSA_MODULUS_LENGTH,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["encrypt", "decrypt"],
	);
	const publicKey = (await crypto.subtle.exportKey(
		"jwk",
		pair.publicKey,
	)) as RsaPublicKeyJwk;
	const privateKeyJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const wrappingKey = await derivePassphraseKey(passphrase, salt);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: toArrayBuffer(iv) },
		wrappingKey,
		toArrayBuffer(contextBytes(JSON.stringify(privateKeyJwk))),
	);
	const protectedPrivateKey: ProtectedPrivateKey = {
		version: ENVELOPE_VERSION,
		kdf: "PBKDF2-SHA-256",
		iterations: PBKDF2_ITERATIONS,
		salt: encodeBase64(salt),
		iv: encodeBase64(iv),
		ciphertext: encodeBase64(new Uint8Array(ciphertext)),
	};
	const unlockedPrivateKey = await crypto.subtle.importKey(
		"jwk",
		privateKeyJwk,
		{ name: "RSA-OAEP", hash: "SHA-256" },
		false,
		["decrypt"],
	);

	return { publicKey, protectedPrivateKey, unlockedPrivateKey };
}

export async function reencryptProtectedPrivateKey(
	envelope: ProtectedPrivateKey,
	oldPassphrase: string,
	newPassphrase: string,
): Promise<ProtectedPrivateKey> {
	if (
		envelope.version !== ENVELOPE_VERSION ||
		envelope.kdf !== "PBKDF2-SHA-256"
	) {
		throw new Error("Unsupported protected-key format.");
	}
	if (envelope.iterations !== PBKDF2_ITERATIONS) {
		throw new Error("Unsupported passphrase derivation parameters.");
	}

	const crypto = webCrypto();
	const oldSalt = decodeBase64(envelope.salt);
	const oldWrappingKey = await derivePassphraseKey(oldPassphrase, oldSalt);
	// A failed decrypt here (wrong passphrase) throws before anything is re-wrapped.
	const privateKeyJson = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: toArrayBuffer(decodeBase64(envelope.iv)) },
		oldWrappingKey,
		toArrayBuffer(decodeBase64(envelope.ciphertext)),
	);

	const newSalt = crypto.getRandomValues(new Uint8Array(16));
	const newIv = crypto.getRandomValues(new Uint8Array(12));
	const newWrappingKey = await derivePassphraseKey(newPassphrase, newSalt);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: toArrayBuffer(newIv) },
		newWrappingKey,
		privateKeyJson,
	);

	return {
		version: ENVELOPE_VERSION,
		kdf: "PBKDF2-SHA-256",
		iterations: PBKDF2_ITERATIONS,
		salt: encodeBase64(newSalt),
		iv: encodeBase64(newIv),
		ciphertext: encodeBase64(new Uint8Array(ciphertext)),
	};
}

export async function unlockUserPrivateKey(
	envelope: ProtectedPrivateKey,
	passphrase: string,
): Promise<CryptoKey> {
	if (
		envelope.version !== ENVELOPE_VERSION ||
		envelope.kdf !== "PBKDF2-SHA-256"
	) {
		throw new Error("Unsupported protected-key format.");
	}
	if (envelope.iterations !== PBKDF2_ITERATIONS) {
		throw new Error("Unsupported passphrase derivation parameters.");
	}

	const crypto = webCrypto();
	const salt = decodeBase64(envelope.salt);
	const wrappingKey = await derivePassphraseKey(passphrase, salt);
	const privateKeyJson = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: toArrayBuffer(decodeBase64(envelope.iv)) },
		wrappingKey,
		toArrayBuffer(decodeBase64(envelope.ciphertext)),
	);

	return crypto.subtle.importKey(
		"jwk",
		JSON.parse(new TextDecoder().decode(privateKeyJson)) as JsonWebKey,
		{ name: "RSA-OAEP", hash: "SHA-256" },
		false,
		["decrypt"],
	);
}

export async function encryptPayload<T>(
	payload: T,
	context: string,
	recipients: RecipientPublicKey[],
): Promise<EncryptedPayload> {
	if (recipients.length === 0) {
		throw new Error("At least one recipient is required.");
	}

	const crypto = webCrypto();
	const recipientIds = new Set<string>();
	const dataKey = await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		true,
		["encrypt", "decrypt"],
	);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(iv),
			additionalData: toArrayBuffer(contextBytes(context)),
		},
		dataKey,
		toArrayBuffer(contextBytes(JSON.stringify(payload))),
	);
	const rawDataKey = await crypto.subtle.exportKey("raw", dataKey);
	const encryptedKeys: Record<string, string> = {};

	for (const recipient of recipients) {
		if (!recipient.userId || recipientIds.has(recipient.userId)) {
			throw new Error("Recipient IDs must be non-empty and unique.");
		}
		recipientIds.add(recipient.userId);

		const publicKey = await crypto.subtle.importKey(
			"jwk",
			recipient.key,
			{ name: "RSA-OAEP", hash: "SHA-256" },
			false,
			["encrypt"],
		);
		const wrappedKey = await crypto.subtle.encrypt(
			{ name: "RSA-OAEP" },
			publicKey,
			rawDataKey,
		);
		encryptedKeys[recipient.userId] = encodeBase64(new Uint8Array(wrappedKey));
	}

	return {
		version: ENVELOPE_VERSION,
		iv: encodeBase64(iv),
		ciphertext: encodeBase64(new Uint8Array(ciphertext)),
		encryptedKeys,
	};
}

export async function decryptPayload<T>(
	envelope: EncryptedPayload,
	context: string,
	recipientUserId: string,
	privateKey: CryptoKey,
): Promise<T> {
	if (envelope.version !== ENVELOPE_VERSION) {
		throw new Error("Unsupported encrypted-payload format.");
	}

	const wrappedKey = envelope.encryptedKeys[recipientUserId];
	if (!wrappedKey) {
		throw new Error("This user is not a recipient of the encrypted payload.");
	}

	const crypto = webCrypto();
	const rawDataKey = await crypto.subtle.decrypt(
		{ name: "RSA-OAEP" },
		privateKey,
		toArrayBuffer(decodeBase64(wrappedKey)),
	);
	const dataKey = await crypto.subtle.importKey(
		"raw",
		rawDataKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"],
	);
	const plaintext = await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: toArrayBuffer(decodeBase64(envelope.iv)),
			additionalData: toArrayBuffer(contextBytes(context)),
		},
		dataKey,
		toArrayBuffer(decodeBase64(envelope.ciphertext)),
	);

	return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
