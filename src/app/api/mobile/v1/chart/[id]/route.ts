import { handleMobileChart } from "@/lib/mobile-chart-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;
  return handleMobileChart(req, id);
}
