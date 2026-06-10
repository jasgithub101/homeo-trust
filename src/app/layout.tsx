import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homeo Trust",
  description: "Homeopathy Trust — Clinical Management System",
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
