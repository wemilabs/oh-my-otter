export const REPO_URL = "https://github.com/wemilabs/oh-my-otter";

export const NAV_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/checks", label: "Checks" },
  { href: "/tasks", label: "Tasks" },
  { href: "/results", label: "Results" },
  { href: "/methodology", label: "Methodology" },
] as const;

export const MOBILE_NAV_LINKS = [
  ...NAV_LINKS,
  { href: "/contribute", label: "Contribute" },
  { href: "/privacy", label: "Privacy" },
] as const;

export const FOOTER_LINKS = MOBILE_NAV_LINKS;
