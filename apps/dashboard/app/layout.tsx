import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AI Dev Team",
  description: "Multi-agent development control plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
