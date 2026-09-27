import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GATE AI - GATE CSE 2027 Study Platform",
  description: "Personal GATE CSE 2027 study platform with AI chat, study tracker and analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="theme-dark font-sans antialiased">{children}</body>
    </html>
  );
}