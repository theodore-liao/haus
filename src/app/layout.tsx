import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
          {`try{var s=+localStorage.getItem("haus.uiScale");if(s>0&&s!==1)document.documentElement.style.fontSize=(Math.min(1.3,Math.max(0.85,s))*100)+"%"}catch(e){}`}
        </Script>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#10182A",
              border: "1px solid rgba(148,163,184,0.16)",
              color: "#E6EDF7",
            },
          }}
        />
      </body>
    </html>
  );
}
