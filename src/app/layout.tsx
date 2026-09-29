import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cinzel",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Grimório — RPG Solo com Mestre IA",
  description:
    "Jogue RPG solo com um Mestre de IA que conhece as regras do seu jogo, rola dados e narra a aventura.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${cinzel.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
