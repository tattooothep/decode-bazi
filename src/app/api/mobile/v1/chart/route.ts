import { handleMobileChart } from "@/lib/mobile-chart-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleMobileChart(req);
}

export async function POST(req: Request) {
  return handleMobileChart(req);
}
