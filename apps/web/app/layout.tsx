import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Oku Admin",
  description: "X automation control panel",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
