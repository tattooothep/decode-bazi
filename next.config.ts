import type { NextConfig } from "next";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
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
      { source: "/mygoal", destination: "/mygoal.html" },
      { source: "/picker", destination: "/picker.html" },
      { source: "/heluo", destination: "/heluo.html" },
      { source: "/fengshui", destination: "/fengshui.html" },
      { source: "/datepick", destination: "/datepick.html" },
      { source: "/comparison", destination: "/comparison.html" },
      { source: "/compare", destination: "/comparison.html" },
      { source: "/forecast", destination: "/forecast.html" },
      { source: "/divine", destination: "/forecast.html" },
      // 17 พ.ค. · อาเจ๊กฮ้ง 4 หน้าใหม่ + 3 หน้าผม
      { source: "/compass", destination: "/compass.html" },
      { source: "/compass-studio", destination: "/compass-studio.html" },
      { source: "/luopan", destination: "/luopan.html" }, // 30 พ.ค. · เลื่อนหล่อแก 14環+ดาวเหินจร (เดิมชี้ compass-studio เก่า)
      { source: "/fengshui-pro", destination: "/fengshui-pro.html" },
      { source: "/katakagae", destination: "/katakagae.html" },
      { source: "/auspicious", destination: "/auspicious.html" },
      { source: "/solar-terms", destination: "/solar-terms.html" },
      { source: "/accuracy", destination: "/accuracy.html" },
      { source: "/why-us", destination: "/accuracy.html" },
      { source: "/methodology", destination: "/methodology.html" },
      { source: "/yongshen-method", destination: "/methodology.html" },
    ];
  },
};

export default nextConfig;
