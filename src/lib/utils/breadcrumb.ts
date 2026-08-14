import { NAV_ITEMS, type NavItem } from "@/config/navigation";

interface Crumb {
  title: string;
  href: string;
}

function flatten(items: NavItem[], acc: Map<string, string> = new Map()): Map<string, string> {
  for (const item of items) {
    acc.set(item.href, item.title);
    if (item.children) flatten(item.children, acc);
  }
  return acc;
}

const TITLES_BY_HREF = flatten(NAV_ITEMS);

/**
 * Construit un fil d'Ariane à partir du pathname en résolvant chaque segment
 * connu vers son libellé de navigation. Segments inconnus (ex. un id
 * dynamique `[id]`) sont affichés tels quels — les pages concernées peuvent
 * surcharger ce comportement plus tard si besoin.
 */
export function buildBreadcrumb(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let path = "";
  for (const segment of segments) {
    path += `/${segment}`;
    crumbs.push({ title: TITLES_BY_HREF.get(path) ?? segment, href: path });
  }
  return crumbs;
}
