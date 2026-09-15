import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Streamline", description: "Closed-loop margin control for restaurant groups." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
