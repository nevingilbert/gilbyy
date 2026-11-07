import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PALETTE } from "./palette";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gilbyy",
  description: "A little driving game. Load it up and drive around.",
  // Added to a home screen, it opens full screen like an app, the status bar over the sky.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Gilbyy" },
};

// Edge to edge on every phone, the iPhone Duo open or shut included: the world runs under
// the notch and the home bar, and the HUD keeps inside the safe area (`.safe`). No pinch
// zoom: two fingers are for the photo camera and the pedals.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: PALETTE.fog,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
