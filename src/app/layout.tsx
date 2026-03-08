import type { Metadata } from "next";
import "./globals.css";
import { ThemeBridge } from "@/components/app/ThemeBridge";

export const metadata: Metadata = {
  title: "Teux Planner",
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
        <ThemeBridge />
        {children}
      </body>
    </html>
  );
}
