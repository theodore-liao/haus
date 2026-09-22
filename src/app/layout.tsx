import type { Metadata } from "next";
import Script from "next/script";
// Self-hosted. next/font/google fell back to Arial whenever fonts.googleapis.com was unreachable.
import { GeistSans as geistSans } from "geist/font/sans";
import { GeistMono as geistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ConsoleTap } from "@/components/console-tap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haus",
  description: "Private household wealth office.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full dark`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <Script id="ui-scale" strategy="beforeInteractive">
          {`try{var s=+localStorage.getItem("haus.uiScale");if(s>0&&s!==1)document.documentElement.style.fontSize=(Math.min(1.3,Math.max(0.85,s))*100)+"%";if(localStorage.getItem("haus.privacy")==="1")document.documentElement.classList.add("privacy")}catch(e){}`}
        </Script>
        {children}
        <ConsoleTap />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--card-elevated)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              fontFamily: "var(--font-geist-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}
