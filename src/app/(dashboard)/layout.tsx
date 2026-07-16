import { redirect } from "next/navigation";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import AuthChecker from "~/components/auth/AuthChecker";
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
      <AppHeader>{children}</AppHeader>
    </div>
  );
}