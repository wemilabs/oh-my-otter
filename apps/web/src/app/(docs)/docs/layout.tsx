import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { LogoMark } from "@/components/site/logo";
import { NAV_LINKS, REPO_URL } from "@/components/site/links";
import { source } from "@/lib/source";

const links = [
  ...NAV_LINKS.map(({ href, label }) => ({ text: label, url: href })),
  { text: "GitHub", url: REPO_URL, external: true },
];

export default function DocsRootLayout({ children }: LayoutProps<"/docs">) {
  return (
    <RootProvider
      theme={{ enabled: false }}
      search={{ options: { type: "static" } }}
    >
      <DocsLayout
        tree={source.getPageTree()}
        nav={{
          title: (
            <span className="flex min-h-11 min-w-11 items-center gap-2 text-[15px] font-semibold tracking-tight">
              <LogoMark />
              <span>Oh My Otter</span>
            </span>
          ),
          url: "/",
        }}
        links={links}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
