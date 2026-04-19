import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import AuthChecker from "~/components/auth/AuthChecker";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
     const session = await auth.api.getSession({
      headers: await headers(),
    });
  
      if (!session) {
      redirect("/login"); 
    }
  
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <AuthChecker />
      <nav className="mb-8 flex items-center gap-4">
        <Link href="/" className="text-sm bg-gray-800 px-4 py-2 rounded-lg hover:bg-gray-700 transition">
          ← Back to Dashboard
        </Link>
      </nav>
      {children}
    </div>
  );
}