import type { ReactNode } from "react";
import "./admin-theme.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="hk-admin">{children}</div>;
}
