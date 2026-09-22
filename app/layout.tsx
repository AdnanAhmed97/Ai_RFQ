import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RFx Intelligence",
  description:
    "An AI-native procurement decision workspace that turns unstructured supplier responses into normalized, evidence-backed commercial intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
