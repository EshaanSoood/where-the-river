import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Background from "@/components/Background";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dream River",
  description: "Paper Boat / Six Degrees of Separation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/ezc4ghs.css" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased page-frame page-viewport`}>
        <Background />
        <div className="page-container">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
