"use client";

import {
	AlertTriangle,
	Bell,
	LockKeyhole,
	LogOut,
	Mail,
	Monitor,
	Palette,
	ShieldCheck,
	UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useEncryptionVault } from "~/components/auth/encryption-vault-provider";
import { PushSetupButton } from "~/components/push-setup-button";
import ThemeToggle from "~/components/theme-toggle";
import { reencryptProtectedPrivateKey } from "~/lib/e2ee";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

const TABS = ["account", "security", "notifications", "appearance"] as const;
type SettingsTab = (typeof TABS)[number];
const TAB_META: Record<SettingsTab, { label: string; icon: typeof UserRound }> =
	{
		account: { label: "Account", icon: UserRound },
		security: { label: "Security", icon: ShieldCheck },
		notifications: { label: "Notifications", icon: Bell },
		appearance: { label: "Appearance", icon: Palette },
	};

export default function SettingsPage() {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const { keys: encryptionKeys } = useEncryptionVault();
	const [activeTab, setActiveTab] = useState<SettingsTab>("account");
	const [username, setUsername] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [profileMessage, setProfileMessage] = useState("");
	const [passwordMessage, setPasswordMessage] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [isChangingPassword, setIsChangingPassword] = useState(false);
	const [vaultCurrentPassphrase, setVaultCurrentPassphrase] = useState("");
	const [vaultNewPassphrase, setVaultNewPassphrase] = useState("");
	const [vaultConfirmation, setVaultConfirmation] = useState("");
	const [vaultMessage, setVaultMessage] = useState("");
	const [isChangingVaultPassphrase, setIsChangingVaultPassphrase] =
		useState(false);
	const [deleteConfirmation, setDeleteConfirmation] = useState("");
	const [deleteMessage, setDeleteMessage] = useState("");
	const [isDeletingAccount, setIsDeletingAccount] = useState(false);

	type SessionListItem = {
		id: string;
		token: string;
		userAgent?: string | null;
		ipAddress?: string | null;
		updatedAt: string | Date;
	};
	const [sessionsList, setSessionsList] = useState<SessionListItem[]>([]);
	const updatePassphraseMutation =
		api.encryption.updatePassphrase.useMutation();
	const prepareAccountDeletion =
		api.household.prepareAccountDeletion.useMutation();

	const refetchSessions = async () => {
		const { data } = await authClient.listSessions();
		setSessionsList((data as SessionListItem[] | null) ?? []);
	};

	useEffect(() => {
		void (async () => {
			const { data } = await authClient.listSessions();
			setSessionsList((data as SessionListItem[] | null) ?? []);
		})();
	}, []);

	useEffect(() => {
		if (session?.user.username) setUsername(session.user.username);
	}, [session?.user.username]);

	const saveUsername = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setProfileMessage("");
		setIsSavingProfile(true);
		try {
			const { error } = await authClient.updateUser({
				username: username.trim(),
			});
			if (error) throw new Error(error.message || "Unable to update username.");
			setProfileMessage("Username updated.");
		} catch (error) {
			setProfileMessage(
				error instanceof Error ? error.message : "Unable to update username.",
			);
		} finally {
			setIsSavingProfile(false);
		}
	};

	const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setPasswordMessage("");
		if (newPassword !== confirmation) {
			setPasswordMessage("The new passwords do not match.");
			return;
		}

		setIsChangingPassword(true);
		try {
			const { error } = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});
			if (error) throw new Error(error.message || "Unable to change password.");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmation("");
			setPasswordMessage("Password changed. Other sessions were signed out.");
		} catch (error) {
			setPasswordMessage(
				error instanceof Error ? error.message : "Unable to change password.",
			);
		} finally {
			setIsChangingPassword(false);
		}
	};

	const changeVaultPassphrase = async (
		event: React.FormEvent<HTMLFormElement>,
	) => {
		event.preventDefault();
		setVaultMessage("");
		if (vaultNewPassphrase !== vaultConfirmation) {
			setVaultMessage("The new vault passphrases do not match.");
			return;
		}

		setIsChangingVaultPassphrase(true);
		try {
			const protectedPrivateKey = await reencryptProtectedPrivateKey(
				encryptionKeys.protectedPrivateKey,
				vaultCurrentPassphrase,
				vaultNewPassphrase,
			);
			await updatePassphraseMutation.mutateAsync({ protectedPrivateKey });
			setVaultCurrentPassphrase("");
			setVaultNewPassphrase("");
			setVaultConfirmation("");
			setVaultMessage(
				"Vault passphrase changed. Unlock the vault again on other devices.",
			);
		} catch {
			setVaultMessage(
				"Unable to change the vault passphrase. Check the current passphrase.",
			);
		} finally {
			setIsChangingVaultPassphrase(false);
		}
	};

	const revokeSession = async (token: string) => {
		await authClient.revokeSession({ token });
		await refetchSessions();
	};

	const revokeOtherSessions = async () => {
		await authClient.revokeOtherSessions();
		await refetchSessions();
	};

	const deleteAccount = async () => {
		setDeleteMessage("");
		if (
			deleteConfirmation.trim() !==
			(session?.user.username ?? session?.user.email)
		) {
			setDeleteMessage(
				"Type your username exactly to confirm account deletion.",
			);
			return;
		}

		setIsDeletingAccount(true);
		try {
			await prepareAccountDeletion.mutateAsync();
			const { error } = await authClient.deleteUser();
			if (error) throw new Error(error.message || "Unable to delete account.");
			router.push("/login");
		} catch (error) {
			setDeleteMessage(
				error instanceof Error ? error.message : "Unable to delete account.",
			);
		} finally {
			setIsDeletingAccount(false);
		}
	};

	const field =
		"w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-gray-800 dark:bg-gray-900 dark:text-white";

	return (
		<main className="mx-auto w-full max-w-4xl px-4 pb-10 sm:px-6 lg:px-8">
			<header className="mb-6">
				<p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.28em]">
					Account
				</p>
				<h1 className="mt-1 font-black text-3xl text-slate-950 tracking-tight dark:text-white">
					Settings
				</h1>
			</header>

			<nav
				aria-label="Settings tabs"
				className="mb-5 flex flex-wrap gap-2 border-slate-200 border-b dark:border-gray-800"
			>
				{TABS.map((tab) => {
					const { label, icon: Icon } = TAB_META[tab];
					const active = activeTab === tab;
					return (
						<button
							aria-current={active ? "page" : undefined}
							className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 font-bold text-sm transition ${
								active
									? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
									: "border-transparent text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200"
							}`}
							key={tab}
							onClick={() => setActiveTab(tab)}
							type="button"
						>
							<Icon className="h-4 w-4" /> {label}
						</button>
					);
				})}
			</nav>

			{activeTab === "account" && (
				<div className="space-y-4">
					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center gap-2">
							<UserRound className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Login name
							</h2>
						</div>
						<form
							className="max-w-xl space-y-3"
							onSubmit={(event) => void saveUsername(event)}
						>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="account-username"
							>
								Username
							</label>
							<input
								autoComplete="username"
								className={field}
								id="account-username"
								maxLength={30}
								minLength={3}
								onChange={(event) => setUsername(event.target.value)}
								required
								value={username}
							/>
							{profileMessage && (
								<output className="text-slate-600 text-sm dark:text-gray-300">
									{profileMessage}
								</output>
							)}
							<button
								className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white text-xs transition hover:bg-emerald-800 disabled:opacity-50"
								disabled={isPending || isSavingProfile || !username.trim()}
								type="submit"
							>
								{isSavingProfile ? "Saving..." : "Save username"}
							</button>
						</form>
					</section>

					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center gap-2">
							<Mail className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Email address
							</h2>
						</div>
						<div className="max-w-xl space-y-2">
							<input
								aria-label="Account email"
								className={field}
								readOnly
								value={session?.user.email ?? ""}
							/>
							<p className="text-slate-500 text-xs leading-5 dark:text-gray-400">
								{session?.user.emailVerified
									? "Verified email. Changing it requires email verification, which is not configured yet."
									: "Email is not verified. Email verification and secure email changes are not configured yet."}
							</p>
						</div>
					</section>

					<section className="rounded-2xl border border-rose-200 bg-white p-5 dark:border-rose-950 dark:bg-gray-950">
						<div className="mb-2 flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-rose-600" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Danger zone
							</h2>
						</div>
						<p className="max-w-xl text-slate-500 text-xs leading-5 dark:text-gray-400">
							Deleting your account permanently removes your login, and cascades
							to data you own across households, groups, budgets, and agenda
							items. This cannot be undone.
						</p>
						<div className="mt-3 max-w-xl space-y-2">
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="delete-confirmation"
							>
								Type your username (
								{session?.user.username ?? session?.user.email}) to confirm
							</label>
							<input
								className={field}
								id="delete-confirmation"
								onChange={(event) => setDeleteConfirmation(event.target.value)}
								value={deleteConfirmation}
							/>
							{deleteMessage && (
								<output className="text-rose-600 text-sm">
									{deleteMessage}
								</output>
							)}
							<button
								className="rounded-xl bg-rose-600 px-4 py-2.5 font-bold text-white text-xs transition hover:bg-rose-700 disabled:opacity-50"
								disabled={isDeletingAccount || !deleteConfirmation.trim()}
								onClick={() => void deleteAccount()}
								type="button"
							>
								{isDeletingAccount ? "Deleting..." : "Delete account"}
							</button>
						</div>
					</section>
				</div>
			)}

			{activeTab === "security" && (
				<div className="space-y-4">
					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center gap-2">
							<LockKeyhole className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Password
							</h2>
						</div>
						<form
							className="max-w-xl space-y-3"
							onSubmit={(event) => void changePassword(event)}
						>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="current-password"
							>
								Current password
							</label>
							<input
								autoComplete="current-password"
								className={field}
								id="current-password"
								minLength={1}
								onChange={(event) => setCurrentPassword(event.target.value)}
								required
								type="password"
								value={currentPassword}
							/>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="new-password"
							>
								New password
							</label>
							<input
								autoComplete="new-password"
								className={field}
								id="new-password"
								minLength={8}
								onChange={(event) => setNewPassword(event.target.value)}
								required
								type="password"
								value={newPassword}
							/>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="confirm-password"
							>
								Confirm new password
							</label>
							<input
								autoComplete="new-password"
								className={field}
								id="confirm-password"
								minLength={8}
								onChange={(event) => setConfirmation(event.target.value)}
								required
								type="password"
								value={confirmation}
							/>
							{passwordMessage && (
								<output className="text-slate-600 text-sm dark:text-gray-300">
									{passwordMessage}
								</output>
							)}
							<button
								className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white text-xs transition hover:bg-emerald-800 disabled:opacity-50"
								disabled={isChangingPassword}
								type="submit"
							>
								{isChangingPassword ? "Updating..." : "Change password"}
							</button>
						</form>
					</section>

					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center gap-2">
							<ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Vault passphrase
							</h2>
						</div>
						<p className="mb-3 max-w-xl text-slate-500 text-xs leading-5 dark:text-gray-400">
							This passphrase protects your private encryption key and is
							separate from your login password. It cannot be reset if
							forgotten.
						</p>
						<form
							className="max-w-xl space-y-3"
							onSubmit={(event) => void changeVaultPassphrase(event)}
						>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="vault-current-passphrase"
							>
								Current vault passphrase
							</label>
							<input
								autoComplete="current-password"
								className={field}
								id="vault-current-passphrase"
								minLength={12}
								onChange={(event) =>
									setVaultCurrentPassphrase(event.target.value)
								}
								required
								type="password"
								value={vaultCurrentPassphrase}
							/>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="vault-new-passphrase"
							>
								New vault passphrase
							</label>
							<input
								autoComplete="new-password"
								className={field}
								id="vault-new-passphrase"
								minLength={12}
								onChange={(event) => setVaultNewPassphrase(event.target.value)}
								required
								type="password"
								value={vaultNewPassphrase}
							/>
							<label
								className="block font-semibold text-slate-600 text-xs dark:text-gray-300"
								htmlFor="vault-confirm-passphrase"
							>
								Confirm new vault passphrase
							</label>
							<input
								autoComplete="new-password"
								className={field}
								id="vault-confirm-passphrase"
								minLength={12}
								onChange={(event) => setVaultConfirmation(event.target.value)}
								required
								type="password"
								value={vaultConfirmation}
							/>
							{vaultMessage && (
								<output className="text-slate-600 text-sm dark:text-gray-300">
									{vaultMessage}
								</output>
							)}
							<button
								className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white text-xs transition hover:bg-emerald-800 disabled:opacity-50"
								disabled={isChangingVaultPassphrase}
								type="submit"
							>
								{isChangingVaultPassphrase
									? "Updating..."
									: "Change vault passphrase"}
							</button>
						</form>
					</section>

					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Monitor className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
								<h2 className="font-bold text-slate-950 dark:text-white">
									Active sessions
								</h2>
							</div>
							{(sessionsList?.length ?? 0) > 1 && (
								<button
									className="rounded-xl border border-slate-300 px-3 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
									onClick={() => void revokeOtherSessions()}
									type="button"
								>
									Sign out other devices
								</button>
							)}
						</div>
						<div className="space-y-2">
							{(sessionsList ?? []).map((item) => {
								const isCurrent = item.token === session?.session.token;
								return (
									<div
										className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-gray-800"
										key={item.id}
									>
										<div className="min-w-0">
											<p className="truncate font-semibold text-slate-900 text-sm dark:text-white">
												{item.userAgent ?? "Unknown device"}
												{isCurrent && (
													<span className="ml-2 text-emerald-700 text-xs dark:text-emerald-400">
														This device
													</span>
												)}
											</p>
											<p className="text-slate-500 text-xs dark:text-gray-400">
												{item.ipAddress ?? "Unknown IP"} · Last active{" "}
												{new Date(item.updatedAt).toLocaleDateString("en-US")}
											</p>
										</div>
										{!isCurrent && (
											<button
												className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 font-bold text-slate-700 text-xs transition hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
												onClick={() => void revokeSession(item.token)}
												type="button"
											>
												Sign out
											</button>
										)}
									</div>
								);
							})}
						</div>
					</section>

					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<h2 className="font-bold text-slate-950 dark:text-white">
							Session
						</h2>
						<button
							className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700 text-xs transition hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
							onClick={() => void authClient.signOut()}
							type="button"
						>
							<LogOut className="h-4 w-4" /> Sign out
						</button>
					</section>
				</div>
			)}

			{activeTab === "notifications" && (
				<div className="space-y-4">
					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center gap-2">
							<Bell className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Push notifications
							</h2>
						</div>
						<p className="mb-3 max-w-xl text-slate-500 text-xs leading-5 dark:text-gray-400">
							Enable push notifications on this device to get agenda reminders
							and alerts.
						</p>
						<PushSetupButton />
					</section>
				</div>
			)}

			{activeTab === "appearance" && (
				<div className="space-y-4">
					<section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
						<div className="mb-4 flex items-center gap-2">
							<Palette className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
							<h2 className="font-bold text-slate-950 dark:text-white">
								Theme
							</h2>
						</div>
						<p className="mb-3 max-w-xl text-slate-500 text-xs leading-5 dark:text-gray-400">
							Switch between light and dark mode for this device.
						</p>
						<ThemeToggle />
					</section>
				</div>
			)}
		</main>
	);
}
