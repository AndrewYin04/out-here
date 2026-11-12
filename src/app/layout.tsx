import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Out Here",
  description: "A live map of nearby plans you can join right now.",
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
