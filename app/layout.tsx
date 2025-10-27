import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = {
  title: "NOC Panel",
  description: "Operational dashboard for Global Media Data Prima",
  icons: {
    icon: "/resouce/logo/cut-logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-[#EEF2FF]`}>
        {children}
      </body>
    </html>
  );
}
