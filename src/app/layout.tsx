import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeBridge } from "@/components/app/ThemeBridge";

export const metadata: Metadata = {
  title: "Cheqlist",
  description: "Offline-first personal weekly planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <ThemeBridge />
        {children}
      </body>
    </html>
  );
}
