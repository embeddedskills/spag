import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import UpcomingWidget from "~/components/ui/upcoming";
import { PWARegister } from "~/components/pwa-register";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "SPAGos",
  description: "Your Personal Finance and Agenda Manager",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Agenda App",
  },
  other: {
    crossorigin: "use-credentials",
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents annoying auto-zooming on inputs in mobile Safari
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const themeMode = cookieStore.get("theme-mode")?.value === "dark" ? "dark" : "light";

  return (
    <html lang="en" className={`${geist.variable} ${themeMode === "dark" ? "dark" : ""}`.trim()}>
      <head>
        <link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        <PWARegister />
        <TRPCReactProvider>
          {children}
          <UpcomingWidget />
        </TRPCReactProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
