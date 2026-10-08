import type { Metadata } from "next";
import { Archivo, Source_Serif_4, B612_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

const b612 = B612_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-b612",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NEMO — background intelligence for private capital",
  description:
    "Multi-agent due-diligence: identity fingerprinting, evidence scoring, double-blind review.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${sourceSerif.variable} ${b612.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
