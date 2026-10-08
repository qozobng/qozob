// =========================================================================
// SHARED STATION BRAND DETECTION
// Single source of truth used by the public map and the manager dashboard.
// =========================================================================

export interface BrandInfo {
  logoUrl: string | null;
  color: string;
  text: string;
}

type BrandRule = { match: (lowerName: string) => boolean; logoUrl: string; color: string };

const includes = (needle: string) => (n: string) => n.includes(needle);

// Order matters: the first matching rule wins (same order as the original if/else chain).
const BRAND_RULES: BrandRule[] = [
  { match: includes("nnpc"), logoUrl: "/logos/nnpc.png", color: "#00a94d" },
  { match: includes("total"), logoUrl: "/logos/total.png", color: "#1e3a8a" },
  { match: includes("mobil"), logoUrl: "/logos/mobil.png", color: "#2563eb" },
  { match: includes("oando"), logoUrl: "/logos/oando.png", color: "#dc2626" },
  { match: includes("conoil"), logoUrl: "/logos/conoil.png", color: "#eab308" },
  {
    match: (n) => n.includes("ardova") || n === "ap" || n.startsWith("ap ") || n.includes(" ap ") || n.includes("a.p") || n.includes("a p "),
    logoUrl: "/logos/ap-brand.png",
    color: "#ea580c",
  },
  { match: includes("shell"), logoUrl: "/logos/shell.png", color: "#facc15" },
  { match: includes("rainoil"), logoUrl: "/logos/rainoil.png", color: "#0ea5e9" },
  { match: includes("bovas"), logoUrl: "/logos/bovas.png", color: "#f43f5e" },
  { match: includes("mrs"), logoUrl: "/logos/mrs.png", color: "#712539" },
  { match: (n) => n.includes("11plc") || /\b11\b/.test(n), logoUrl: "/logos/11.png", color: "#0759ad" },
  { match: includes("shafa"), logoUrl: "/logos/shafa.png", color: "#e63035" },
  { match: includes("heyden"), logoUrl: "/logos/heyden.png", color: "#f76300" },
  { match: includes("nipco"), logoUrl: "/logos/nipco.png", color: "#f50002" },
  { match: includes("techno"), logoUrl: "/logos/techno.png", color: "#ee161f" },
  { match: includes("enyo"), logoUrl: "/logos/enyo.png", color: "#313864" },
  { match: includes("matrix"), logoUrl: "/logos/matrix.png", color: "#5dc0e5" },
  { match: includes("fatgbems"), logoUrl: "/logos/fatgbems.png", color: "#a13227" },
  { match: includes("forte"), logoUrl: "/logos/forte.png", color: "#a3bc01" },
  // NOTE: the three logos below are not in /public/logos yet — <BrandLogo> falls back to initials until they are added.
  { match: includes("petrocam"), logoUrl: "/logos/petrocam.png", color: "#f37021" },
  { match: includes("eterna"), logoUrl: "/logos/eterna.png", color: "#005a8c" },
  { match: includes("pinnacle"), logoUrl: "/logos/pinnacle.png", color: "#b12025" },
];

// Brand detection runs for every marker + list row on every render, so memoise by name.
const brandCache = new Map<string, BrandInfo>();

export function getStationBrandInfo(name: string | null | undefined, customLogoUrl: string | null | undefined): BrandInfo {
  const text = name ? name.substring(0, 2).toUpperCase() : "GS";
  if (customLogoUrl) return { logoUrl: customLogoUrl, color: "#10b981", text };

  const key = name || "";
  const cached = brandCache.get(key);
  if (cached) return cached;

  const lowerName = key.toLowerCase();
  const rule = BRAND_RULES.find((r) => r.match(lowerName));
  const info: BrandInfo = rule ? { logoUrl: rule.logoUrl, color: rule.color, text } : { logoUrl: null, color: "#10b981", text };

  if (brandCache.size > 2000) brandCache.clear(); // simple guard against unbounded growth
  brandCache.set(key, info);
  return info;
}

