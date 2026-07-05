import type { NextConfig } from "next";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  async redirects() {
    return [
      { source: "/calendar-m.html", destination: "/calendar", permanent: false },
      { source: "/master-m.html", destination: "/master", permanent: false },
      { source: "/mygoal-m.html", destination: "/mygoal", permanent: false },
      { source: "/picker-m.html", destination: "/picker", permanent: false },
    ];
  },
  async headers() {
    const noStoreHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
    ];
    const htmlSurfaces = [
      "/",
      "/landing.html",
      "/signup",
      "/signup.html",
      "/reset-password.html",
      "/input",
      "/input.html",
      "/goal",
      "/goal.html",
      "/chart",
      "/chart.html",
      "/today",
      "/today.html",
      "/yongsennetwork",
      "/yongsennetwork.html",
      "/network",
      "/qimen",
      "/qimen.html",
      "/calendar",
      "/calendar.html",
      "/master",
      "/master.html",
      "/master-fusion",
      "/master-fusion.html",
      "/book",
      "/book.html",
      "/mygoal",
      "/mygoal.html",
      "/picker",
      "/picker.html",
      "/heluo",
      "/heluo.html",
      "/fengshui",
      "/fengshui.html",
      "/datepick",
      "/datepick.html",
      "/tianxing",
      "/tianxing.html",
      "/starhour",
      "/comparison",
      "/comparison.html",
      "/compare",
      "/forecast",
      "/forecast.html",
      "/divine",
      "/compass",
      "/compass.html",
      "/compass-studio",
      "/compass-studio.html",
      "/luopan",
      "/luopan.html",
      "/fengshui-pro",
      "/fengshui-pro.html",
      "/katakagae",
      "/katakagae.html",
      "/auspicious",
      "/auspicious.html",
      "/solar-terms",
      "/solar-terms.html",
      "/accuracy",
      "/accuracy.html",
      "/why-us",
      "/methodology",
      "/methodology.html",
      "/yongshen-method",
      "/account",
      "/account.html",
      "/article/geometry",
      "/article-geometry.html",
    ];

    return [
      ...htmlSurfaces.map((source) => ({ source, headers: noStoreHeaders })),
      { source: "/css/mobile-safe.css", headers: noStoreHeaders },
      { source: "/js/hk-user-menu.js", headers: noStoreHeaders },
      // PWA r376 · no-store: deploy ใหม่ = SW/flag ใหม่ถูกเห็นใน navigation ถัดไป (kill-switch สด)
      { source: "/sw.js", headers: noStoreHeaders },
      { source: "/pwa-flag.json", headers: noStoreHeaders },
      { source: "/manifest.json", headers: noStoreHeaders },
      { source: "/js/hk-pwa.js", headers: noStoreHeaders },
    ];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/landing.html" },
      { source: "/signup", destination: "/signup.html" },
      { source: "/reset-password/:token", destination: "/reset-password.html" }, // 31 พ.ค. · หน้าตั้งรหัสใหม่ (ปลายทางลิงก์ลืมรหัส · เดิม 404)
      { source: "/input", destination: "/input.html" },
      { source: "/goal", destination: "/goal.html" },
      { source: "/chart", destination: "/chart.html" },
      { source: "/chartv2", destination: "/chart-v2" },
      { source: "/today", destination: "/today.html" },
      { source: "/yongsennetwork", destination: "/yongsennetwork.html" },
      { source: "/network", destination: "/yongsennetwork.html" },
      { source: "/qimen", destination: "/qimen.html" },
      { source: "/calendar", destination: "/calendar.html" },
      { source: "/master", destination: "/master.html" },
      { source: "/master-fusion", destination: "/master-fusion.html" },
      { source: "/book", destination: "/book.html" }, // r391-book · หนังสือดวงชะตา 6 ศาสตร์ (Natal Book · /book?id=)
      { source: "/mygoal", destination: "/mygoal.html" },
      { source: "/picker", destination: "/picker.html" },
      { source: "/heluo", destination: "/heluo.html" },
      { source: "/fengshui", destination: "/fengshui.html" },
      { source: "/datepick", destination: "/datepick.html" },
      { source: "/tianxing", destination: "/tianxing.html" }, // 29 มิ.ย. · 天星擇日 ดาวจริง 七政四餘 (ศาสตร์ขั้นสูงสุด)
      { source: "/starhour", destination: "/tianxing.html" },
      { source: "/comparison", destination: "/comparison.html" },
      { source: "/compare", destination: "/comparison.html" },
      { source: "/forecast", destination: "/forecast.html" },
      { source: "/divine", destination: "/forecast.html" },
      { source: "/account", destination: "/account.html" },
      // 17 พ.ค. · อาเจ๊กฮ้ง 4 หน้าใหม่ + 3 หน้าผม
      // 5 ก.ค. · retire 3 หน้าไม่ใช้แล้ว (compass/compass-studio/fengshui-pro) → ชี้ไป /fengshui (ไฟล์เดิมเก็บไว้ · กู้คืนได้)
      { source: "/compass", destination: "/fengshui.html" },
      { source: "/compass-studio", destination: "/fengshui.html" },
      { source: "/luopan", destination: "/luopan.html" }, // 30 พ.ค. · เลื่อนหล่อแก 14環+ดาวเหินจร (เดิมชี้ compass-studio เก่า)
      { source: "/fengshui-pro", destination: "/fengshui.html" },
      { source: "/katakagae", destination: "/katakagae.html" },
      { source: "/auspicious", destination: "/auspicious.html" },
      { source: "/solar-terms", destination: "/solar-terms.html" },
      { source: "/accuracy", destination: "/accuracy.html" },
      { source: "/why-us", destination: "/accuracy.html" },
      { source: "/methodology", destination: "/methodology.html" },
      { source: "/yongshen-method", destination: "/methodology.html" },
      { source: "/article/geometry", destination: "/article-geometry.html" }, // 3 ก.ค. · บทความ SEO เรขาคณิตร่วม 3 อารยธรรม
      { source: "/uranian", destination: "/uranian.html" }, // 4 ก.ค. r390 · วงล้อ 90° ยูเรเนียน (ศาสตร์ที่ 6 · Halbsumme/Planetenbild interactive)
      { source: "/dial", destination: "/uranian.html" },
    ];
  },
};

export default nextConfig;
