import { Hero } from "@/components/landing/hero";
import {
  Features,
  FinalCta,
  ResultsTeaser,
  StatsStrip,
  Steps,
} from "@/components/landing/sections";
import { getDataset } from "@/lib/dataset";

export default async function Home() {
  const { dataset, aggregate } = await getDataset();
  const reports = dataset.reports.length;
  const statsReports = dataset.status === "unavailable" ? null : reports;
  return (
    <>
      <Hero />
      <StatsStrip reports={statsReports} />
      <Features />
      <Steps />
      <ResultsTeaser
        reports={reports}
        bands={aggregate.by_band}
        unavailable={dataset.status === "unavailable"}
      />
      <FinalCta />
    </>
  );
}
