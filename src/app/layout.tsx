import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Encore — taste-driven tour routing for independent artists",
  description: "Encore uses the Qloo taste graph and an AI agent to rank markets, route a tour, and recommend venues, co-bills, podcasts and brands — with a reason for every pick.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
