
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://tka-tryon-champion.vercel.app";

const ogImage = `${siteUrl}/og-image.png`;

export const metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: "TKA TryOn",
    template: "%s | TKA TryOn",
  },

  description:
    "Platform simulasi, latihan, dan evaluasi Tes Kemampuan Akademik untuk SD/MI, SMP/MTs, dan SMA/MA/SMK.",

  applicationName: "TKA TryOn",

  openGraph: {
    type: "website",
    locale: "id_ID",
    url: siteUrl,
    siteName: "TKA TryOn",
    title: "TKA TryOn — SKILL ON • CONFIDENCE ON",
    description:
      "Platform simulasi, latihan, dan evaluasi Tes Kemampuan Akademik untuk SD/MI, SMP/MTs, dan SMA/MA/SMK.",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "TKA TryOn — SKILL ON • CONFIDENCE ON",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "TKA TryOn — SKILL ON • CONFIDENCE ON",
    description:
      "Platform simulasi, latihan, dan evaluasi Tes Kemampuan Akademik.",
    images: [ogImage],
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
