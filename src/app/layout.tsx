import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond, Noto_Serif_TC, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Sans · primary UI font (clean, neutral, supports Thai well via system fallback)
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Editorial serif · headings, blockquote, big numerals
const cormorant = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Chinese serif · used for 八字 stems/branches
const notoSerifTC = Noto_Serif_TC({
  variable: "--font-zh",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Decode · 解碼 — Personal AI Sinsae",
  description: "ดวงปาจื้อ + ฉีเหมิน + ปฏิทินมงคล สำหรับการตัดสินใจในแต่ละวัน",
  applicationName: "Decode",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
    apple: "/favicon.svg?v=2",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1419" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${inter.variable} ${cormorant.variable} ${notoSerifTC.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <Script src="/js/hk-lang-state.js?v=2" strategy="beforeInteractive" />
        <Script src="/js/hk-tooltips.js?v=20260707" strategy="afterInteractive" />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
