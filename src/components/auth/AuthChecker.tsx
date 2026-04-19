"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "~/server/better-auth/client";

export default function AuthChecker() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    // Only guard dashboard routes (paths that are not public)
    const protectedPrefixes = ["/agenda", "/spending", "/(dashboard)"];
    const shouldProtect = protectedPrefixes.some(p => pathname?.startsWith(p));
    if (!shouldProtect) return;

    if (!isPending && !session) {
      // ensure sign out on server and redirect
      try {
        authClient.signOut({ fetchOptions: {} }).catch(() => {});
      } catch (e) {
        // ignore
      }
      router.push("/login");
    }
  }, [session, isPending, pathname, router]);

  return null;
}
