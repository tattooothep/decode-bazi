import type { Metadata } from "next";
import SifuLiveClient from "./sifu-live-client";

export const metadata: Metadata = {
  title: "แชทสดกับซินแส · Decode",
  description: "หน้าแยกสำหรับต้นแบบแชทสดกับซินแส: ถามด้วยเสียงหรือข้อความ เห็นสถานะสด และเตรียมต่อเข้าระบบจริงภายหลัง",
  alternates: {
    canonical: "https://hourkey.io/sifu-live",
    languages: {
      th: "https://hourkey.io/th/sifu-live",
      en: "https://hourkey.io/en/sifu-live",
      zh: "https://hourkey.io/zh/sifu-live",
    },
  },
  openGraph: {
    title: "แชทสดกับซินแส · Decode",
    description: "คุยกับซินแสแบบสดด้วยเสียงหรือข้อความในหน้าแยก ก่อนต่อเข้าระบบเว็บหลัก",
    url: "https://hourkey.io/sifu-live",
    siteName: "Decode",
    images: [
      {
        url: "https://hourkey.io/assets/landing-v2/card-sifu-v2.webp",
        width: 720,
        height: 405,
        alt: "หน้าต้นแบบแชทสดกับซินแสของ Decode",
      },
    ],
    locale: "th_TH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "แชทสดกับซินแส · Decode",
    description: "ถามซินแสด้วยเสียงหรือข้อความในหน้าแยก",
    images: ["https://hourkey.io/assets/landing-v2/card-sifu-v2.webp"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Decode Sifu Live",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  url: "https://hourkey.io/sifu-live",
  inLanguage: ["th", "en", "zh"],
  description: "ต้นแบบหน้าแชทสดกับซินแสสำหรับถามตอบด้วยเสียงและข้อความ",
  provider: {
    "@type": "Organization",
    name: "Hourkey",
    url: "https://hourkey.io",
  },
};

export default function SifuLivePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SifuLiveClient />
    </>
  );
}
