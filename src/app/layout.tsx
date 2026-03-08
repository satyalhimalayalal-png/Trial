import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
