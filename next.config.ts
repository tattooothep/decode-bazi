import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/landing.html" },
      { source: "/signup", destination: "/signup.html" },
      { source: "/input", destination: "/input.html" },
      { source: "/goal", destination: "/goal.html" },
      { source: "/chart", destination: "/chart.html" },
      { source: "/today", destination: "/today.html" },
      { source: "/yongsennetwork", destination: "/yongsennetwork.html" },
      { source: "/network", destination: "/yongsennetwork.html" },
      { source: "/qimen", destination: "/qimen.html" },
      { source: "/calendar", destination: "/calendar.html" },
      { source: "/master", destination: "/master.html" },
      { source: "/mygoal", destination: "/mygoal.html" },
      { source: "/picker", destination: "/picker.html" },
      { source: "/master-m", destination: "/master-m.html" },
      { source: "/mygoal-m", destination: "/mygoal-m.html" },
      { source: "/picker-m", destination: "/picker-m.html" },
      { source: "/calendar-m", destination: "/calendar-m.html" },
      { source: "/heluo", destination: "/heluo.html" },
      { source: "/fengshui", destination: "/fengshui.html" },
      { source: "/datepick", destination: "/datepick.html" },
      { source: "/comparison", destination: "/comparison.html" },
      { source: "/compare", destination: "/comparison.html" },

    ];
  },
};

export default nextConfig;
