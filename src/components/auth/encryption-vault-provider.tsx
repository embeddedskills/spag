"use client";

import { Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import {
	cacheSessionPrivateKey,
	createUserEncryptionKeys,
	getCachedSessionPrivateKey,
	type ProtectedPrivateKey,
	type RsaPublicKeyJwk,
	unlockUserPrivateKey,
} from "~/lib/e2ee";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

type EncryptionKeys = {
	userId: string;
	publicKey: RsaPublicKeyJwk;
	protectedPrivateKey: ProtectedPrivateKey;
};

type EncryptionVaultContextValue = {
	keys: EncryptionKeys;
	privateKey: CryptoKey;
};

const EncryptionVaultContext =
	createContext<EncryptionVaultContextValue | null>(null);

export function useEncryptionVault() {
	const context = useContext(EncryptionVaultContext);
	if (!context) {
		throw new Error(
			"useEncryptionVault must be used inside EncryptionVaultProvider.",
		);
	}
	return context;
}

export function EncryptionVaultProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const [passphrase, setPassphrase] = useState("");
	const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
	const [unlockedSessionId, setUnlockedSessionId] = useState<string | null>(
		null,
	);
	const [isRestoringKey, setIsRestoringKey] = useState(true);
	const [error, setError] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);
	const { data: keys, isLoading, refetch } = api.encryption.getMine.useQuery();
	const registerMutation = api.encryption.register.useMutation();
	const vaultUserId = keys?.userId;
	const sessionUserId = session?.user.id;
	const sessionId = session?.session.id;
	const sessionIdentity =
		sessionUserId && sessionId ? `${sessionUserId}:${sessionId}` : null;

	useEffect(() => {
		let cancelled = false;
		setPrivateKey(null);
		setUnlockedSessionId(null);

		if (!vaultUserId || !sessionUserId || !sessionId || isSessionPending) {
			setIsRestoringKey(false);
			return;
		}

		setIsRestoringKey(true);
		void getCachedSessionPrivateKey(sessionUserId, sessionId)
			.then((cachedKey) => {
				if (cancelled || !cachedKey) return;
				setPrivateKey(cachedKey);
				setUnlockedSessionId(`${sessionUserId}:${sessionId}`);
			})
			.finally(() => {
				if (!cancelled) setIsRestoringKey(false);
			});

		return () => {
			cancelled = true;
		};
	}, [isSessionPending, sessionId, sessionUserId, vaultUserId]);

	const submitPassphrase = async () => {
		setError("");
		setIsProcessing(true);
		try {
			if (keys) {
				const unlockedKey = await unlockUserPrivateKey(
					keys.protectedPrivateKey,
					passphrase,
				);
				setPrivateKey(unlockedKey);
				if (sessionUserId && sessionId) {
					await cacheSessionPrivateKey(sessionUserId, sessionId, unlockedKey);
					setUnlockedSessionId(`${sessionUserId}:${sessionId}`);
				}
			} else {
				const keyMaterial = await createUserEncryptionKeys(passphrase);
				let registrationResponseWasLost = false;
				try {
					await registerMutation.mutateAsync({
						publicKey: keyMaterial.publicKey,
						protectedPrivateKey: keyMaterial.protectedPrivateKey,
					});
				} catch (registrationError) {
					const refreshed = await refetch();
					if (!refreshed.data) throw registrationError;
					if (
						refreshed.data.publicKey.n !== keyMaterial.publicKey.n ||
						refreshed.data.publicKey.e !== keyMaterial.publicKey.e
					) {
						throw new Error(
							"A different vault is already registered for this account. Reload and unlock that vault instead of creating another one.",
						);
					}
					registrationResponseWasLost = true;
				}
				if (!registrationResponseWasLost) {
					const refreshed = await refetch();
					if (
						!refreshed.data ||
						refreshed.data.publicKey.n !== keyMaterial.publicKey.n ||
						refreshed.data.publicKey.e !== keyMaterial.publicKey.e
					) {
						throw new Error(
							"Could not confirm that the new vault was saved. Reload the page before trying again.",
						);
					}
				}
				setPrivateKey(keyMaterial.unlockedPrivateKey);
				if (sessionUserId && sessionId) {
					await cacheSessionPrivateKey(
						sessionUserId,
						sessionId,
						keyMaterial.unlockedPrivateKey,
					);
					setUnlockedSessionId(`${sessionUserId}:${sessionId}`);
				}
			}
			setPassphrase("");
		} catch (cause) {
			setError(
				keys
					? "Unable to unlock. Check the vault passphrase."
					: cause instanceof Error
						? cause.message
						: "Unable to initialize encryption.",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	if (isLoading || isSessionPending || isRestoringKey) {
		return (
			<main className="theme-invert-on-light min-h-screen bg-black p-6 text-white">
				<div className="mx-auto flex max-w-xl justify-center p-12">
					<Loader2 className="h-8 w-8 animate-spin text-blue-500" />
				</div>
			</main>
		);
	}

	const isUnlocked = Boolean(
		privateKey && sessionIdentity && unlockedSessionId === sessionIdentity,
	);

	if (!keys || !isUnlocked || !privateKey) {
		const isNewVault = !keys;
		return (
			<main className="theme-invert-on-light min-h-screen bg-black p-4 text-white sm:p-8">
				<section className="mx-auto mt-12 max-w-lg rounded-2xl border border-gray-800 bg-gray-950 p-6 sm:p-8">
					<p className="mb-2 font-black text-[10px] text-blue-400 uppercase tracking-[0.3em]">
						Private app vault
					</p>
					<h1 className="font-bold text-gray-100 text-xl">
						{isNewVault
							? "Create your encryption vault"
							: "Unlock your encryption vault"}
					</h1>
					<p className="mt-3 text-gray-400 text-sm leading-6">
						{isNewVault
							? "Choose a separate vault passphrase. It protects your private key and cannot be reset by the app. Store it safely."
							: "Enter your vault passphrase once for this sign-in session. The vault will stay unlocked in this tab."}
					</p>
					<form
						className="mt-6 space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							void submitPassphrase();
						}}
					>
						<label
							className="block font-bold text-gray-300 text-xs"
							htmlFor="vault-passphrase"
						>
							Vault passphrase
						</label>
						<input
							autoComplete={isNewVault ? "new-password" : "current-password"}
							className="w-full rounded-xl border border-gray-700 bg-black px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
							id="vault-passphrase"
							minLength={12}
							onChange={(event) => setPassphrase(event.target.value)}
							required
							type="password"
							value={passphrase}
						/>
						{error && (
							<p className="text-red-400 text-sm" role="alert">
								{error}
							</p>
						)}
						<button
							className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-black text-white text-xs uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
							disabled={
								passphrase.length < 12 || isProcessing || !sessionIdentity
							}
							type="submit"
						>
							{isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
							{isNewVault ? "Create vault" : "Unlock app"}
						</button>
					</form>
				</section>
			</main>
		);
	}

	return (
		<EncryptionVaultContext.Provider value={{ keys, privateKey }}>
			{children}
		</EncryptionVaultContext.Provider>
	);
}
