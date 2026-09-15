import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeScript } from "../components/theme-script";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Streamline", template: "%s · Streamline" },
  description: "Find the loss. Make the change. Prove the result. Keep what lasts.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f1f6f5" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
