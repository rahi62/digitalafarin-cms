import type { Metadata } from "next";
import "./globals.css";
import "../styles/editor-v03.css";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "DigitalAfarin SEO CMS",
  description: "Headless CMS & SEO Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fa" dir="rtl"><body><Shell>{children}</Shell></body></html>;
}
