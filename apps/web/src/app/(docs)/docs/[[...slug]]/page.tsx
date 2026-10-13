import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { getMDXComponents } from "@/components/docs/mdx";
import { source } from "@/lib/source";

type DocsPageProps = PageProps<"/docs/[[...slug]]">;

export default async function Page(props: DocsPageProps) {
  const { slug = [] } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata(
  props: DocsPageProps,
): Promise<Metadata> {
  const { slug = [] } = await props.params;
  const page = source.getPage(slug);
  if (!page) return {};

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
  };
}

export function generateStaticParams() {
  return source.generateParams();
}
