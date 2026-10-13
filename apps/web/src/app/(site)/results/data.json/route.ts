import { getDataset } from "@/lib/dataset";

export async function GET() {
  const { dataset } = await getDataset();
  return Response.json({ schema_version: 1, reports: dataset.reports });
}
