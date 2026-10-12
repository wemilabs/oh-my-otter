import { Hero } from "@/components/landing/hero";
import {
  Features,
  FinalCta,
  ResultsTeaser,
  StatsStrip,
  Steps,
} from "@/components/landing/sections";
import { getDataset } from "@/lib/dataset";

export default function Home() {
  const { dataset, aggregate } = getDataset();
  const reports = dataset.reports.length;
  return (
    <>
      <Hero />
      <StatsStrip reports={reports} />
      <Features />
      <Steps />
      <ResultsTeaser reports={reports} bands={aggregate.by_band} />
      <FinalCta />
    </>
  );
}
