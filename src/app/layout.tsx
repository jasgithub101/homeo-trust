import type { Metadata } from "next";
import { APP_NAME, APP_NAME_SHORT } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  // Short name keeps the browser tab readable; full name is the app identity.
  title: APP_NAME_SHORT,
  applicationName: APP_NAME,
  description: `${APP_NAME} — Clinical Management System`,
  openGraph: { siteName: APP_NAME },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
