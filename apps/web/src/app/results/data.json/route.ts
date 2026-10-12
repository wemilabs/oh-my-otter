import { getDataset } from "@/lib/dataset";

export const dynamic = "force-static";

export function GET() {
  const { dataset } = getDataset();
  return Response.json({ schema_version: 1, reports: dataset.reports });
}
