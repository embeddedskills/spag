import { redirect } from "next/navigation";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import AuthChecker from "~/components/auth/AuthChecker";
import { EncryptionVaultProvider } from "~/components/auth/encryption-vault-provider";
import AppHeader from "~/components/ui/app-header";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
     const session = await auth.api.getSession({
      headers: await headers(),
    });
  
      if (!session) {
      redirect("/login"); 
    }
  
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <AuthChecker />
      <EncryptionVaultProvider>
        <AppHeader showSmartBar>{children}</AppHeader>
      </EncryptionVaultProvider>
    </div>
  );
}