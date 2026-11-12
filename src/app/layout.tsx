import type { Metadata, Viewport } from "next";
import { BRAND } from "@/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.appName, template: `%s · ${BRAND.appName}` },
  description: "A live map of nearby plans you can join right now.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
