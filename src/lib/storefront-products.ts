import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { CATEGORIES, PRODUCTS, type Product } from "@/lib/catalog";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

type Visual = {
  image: string;
  bg: string;
};

const DEFAULT_VISUAL: Visual = {
  image: "📦",
  bg: "bg-stone-100",
};

const CATEGORY_VISUALS: Record<string, Visual> = {
  "laptops-desktops": { image: "💻", bg: "bg-orange-50" },
  tvs: { image: "📺", bg: "bg-red-50" },
  "phones-tablets": { image: "📱", bg: "bg-amber-50" },
  "computer-accessories": { image: "⌨️", bg: "bg-orange-50" },
  "data-storage": { image: "💾", bg: "bg-stone-100" },
  printers: { image: "🖨️", bg: "bg-red-50" },
  "cctv-networking": { image: "📶", bg: "bg-orange-50" },
  "scanners-projectors": { image: "📽️", bg: "bg-stone-100" },
  gaming: { image: "🎮", bg: "bg-amber-50" },
  "antivirus-software": { image: "🛡️", bg: "bg-orange-50" },
  audio: { image: "🎧", bg: "bg-amber-50" },
  ups: { image: "🔌", bg: "bg-stone-100" },
  ac: { image: "❄️", bg: "bg-orange-50" },
  fridges: { image: "🧊", bg: "bg-red-50" },
};

const IGNORED_BRAND_TOKENS = new Set([
  "refurbished",
  "used",
  "new",
  "special",
  "limited",
  "promotion",
  "promo",
  "offer",
  "hot",
  "best",
  "flash",
]);

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCategorySlug(value: string) {
  const normalized = normalizeSlug(value);
  const exact = CATEGORIES.find(
    (category) =>
      normalizeSlug(category.slug) === normalized || normalizeSlug(category.name) === normalized,
  );
  if (exact) return exact.slug;

  const partial = CATEGORIES.find((category) => {
    const slug = normalizeSlug(category.slug);
    const name = normalizeSlug(category.name);
    return slug.includes(normalized) || normalized.includes(slug) || name.includes(normalized);
  });

  return partial?.slug ?? normalized;
}

function resolveCategoryVisual(slug: string): Visual {
  return CATEGORY_VISUALS[slug] ?? DEFAULT_VISUAL;
}

function getBrandFromName(name: string) {
  const tokens = name
    .replace(/[()[\]{}]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const token = tokens.find((part) => !IGNORED_BRAND_TOKENS.has(part.toLowerCase()));
  if (!token) return "Intech";
  return token.replace(/[^a-z0-9&.-]/gi, "");
}

function normalizeProductName(name: string) {
  return name
    .replace(/[{}()[\]]/g, " ")
    .replace(/^(?:\s*\([^)]*(?:offer|mouse|promotion|hot)[^)]*\)\s*)+/i, "")
    .replace(/^\s*\{[^}]*\}\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[|]+\s*$/g, "")
    .trim()
    .replace(/\b(refur|refurbis)$/i, "Refurbished")
    .replace(/\s{2,}/g, " ");
}

function buildProductDescription(name: string, brand: string, category: string, sourceDescription?: string | null) {
  const cleanName = normalizeProductName(name);

  const lower = cleanName.toLowerCase();
  const condition = /refurbished|renewed|used/i.test(lower) ? "refurbished" : "new";
  const cpu = cleanName.match(/(?:intel\s+)?(?:core\s+)?i[3579](?:\s+\d+(?:st|nd|rd|th)?\s*gen)?/i)?.[0]
    ?? cleanName.match(/(?:ryzen\s+[3579](?:\s+\d+)?|celeron|pentium|amd\s+a\d+|core\s+i[3579])/i)?.[0];
  const ram = cleanName.match(/\b\d+\s*GB(?:\s+RAM)?\b/i)?.[0];
  const storage = cleanName.match(/\b\d+\s*(?:GB|TB)\s*(?:SSD|HDD)\b/i)?.[0];
  const screen = cleanName.match(/\b\d+(?:\.\d+)?\s*(?:["”]|inch(?:es)?)\b/i)?.[0];
  const specs = [cpu, ram, storage, screen].filter(Boolean);
  const specSentence = specs.length ? ` Key specifications include ${specs.join(", ")}.` : "";

  if (category === "laptops-desktops") {
    const type = /server|poweredge/i.test(lower)
      ? "server"
      : /all[- ]?in[- ]?one|desktop/i.test(lower)
        ? "desktop computer"
        : "laptop";
    const useCase = /gaming|legion|rtx|geforce/i.test(lower)
      ? "gaming, creative work and demanding applications"
      : /thinkpad|elitebook|probook|latitude|lifebook|poweredge/i.test(lower)
        ? "business, office and professional workloads"
        : /yoga|x360|touchscreen|2-in-1/i.test(lower)
          ? "students, mobile professionals and everyday productivity"
          : "work, study, browsing and everyday computing";

    return `${cleanName} is a ${condition} ${brand} ${type} designed for ${useCase}. ${specSentence} It is a practical choice for customers looking for ${brand} ${type}s in Nairobi, Kenya, with a focus on value and dependable everyday performance. Shop ${cleanName} from Intech Computer Shop with delivery in Nairobi and across Kenya.`;
  }

  const categoryCopy: Record<string, string> = {
    tvs: `is a ${condition} ${brand} TV designed for home entertainment, streaming and everyday viewing`,
    "phones-tablets": `is a ${condition} ${brand} mobile device for communication, entertainment, study and everyday productivity`,
    "computer-accessories": `is a ${condition} ${brand} computer accessory designed to improve your workstation, connectivity or daily productivity`,
    "data-storage": `is a ${condition} ${brand} storage product for backing up, transferring and managing important files and digital content`,
    printers: `is a ${condition} ${brand} printing solution suitable for home, school, office and small-business use`,
    "cctv-networking": `is a ${condition} ${brand} networking or security product designed for reliable connectivity and protection in homes, offices and businesses`,
    "scanners-projectors": `is a ${condition} ${brand} imaging solution suitable for presentations, teaching, meetings, scanning and office workflows`,
    gaming: `is a ${condition} ${brand} gaming product designed to enhance gaming and entertainment setups`,
    "antivirus-software": `is a ${condition} ${brand} software solution designed to help protect devices, files and everyday digital activity`,
    audio: `is a ${condition} ${brand} audio product designed for calls, music and everyday entertainment`,
    ups: `is a ${condition} ${brand} power-backup product designed to help protect compatible electronics during power interruptions`,
    ac: `is a ${condition} ${brand} air conditioner designed to provide comfortable indoor cooling`,
    fridges: `is a ${condition} ${brand} refrigerator designed for practical food and beverage storage at home or in business`,
  };

  const sentence = categoryCopy[category] ?? `is a ${condition} ${brand} technology product designed for reliable everyday use`;
  return `${cleanName} ${sentence}. ${specSentence} Find ${brand} products and technology solutions at Intech Computer Shop in Nairobi, Kenya, with delivery available across Kenya. Order online or contact our team for product availability and support.`;
}


function capitalizeSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function mapDatabaseProduct(row: ProductRow): Product {
  const category = resolveCategorySlug(row.category);
  const visual = resolveCategoryVisual(category);
  const categoryName = CATEGORIES.find((item) => item.slug === category)?.name ?? capitalizeSlug(category);
  const brand = getBrandFromName(row.name) || categoryName.split(" ")[0] || "Intech";
  const imageUrls = Array.from(
    new Set([...(row.image_urls ?? []), row.image_url].filter((url): url is string => Boolean(url))),
  );

  return {
    id: row.id,
    name: normalizeProductName(row.name),
    brand,
    category,
    price: Number(row.price ?? 0),
    image: visual.image,
    bg: visual.bg,
    rating: 4.5,
    reviews: 0,
    stock: Number(row.stock ?? 0),
    oldPrice:
      row.old_price && Number(row.old_price) > Number(row.price ?? 0)
        ? Number(row.old_price)
        : undefined,
    description: buildProductDescription(row.name, brand, category, row.description),
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length ? imageUrls : undefined,
  };
}

export function mergeCatalogProducts(...lists: Product[][]) {
  const merged: Product[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const product of list) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push(product);
    }
  }

  return merged;
}

export async function fetchStorefrontProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return PRODUCTS;
  }

  const liveProducts = (data as ProductRow[])
    .filter((row) => row.active)
    .map(mapDatabaseProduct);

  return mergeCatalogProducts(liveProducts, PRODUCTS);
}

export async function fetchStorefrontProductById(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();

  if (!error && data?.active) {
    return mapDatabaseProduct(data);
  }

  const fallback = PRODUCTS.find((product) => product.id === id);
  return fallback ?? null;
}

export function getProductsByCategory(products: Product[], slug: string) {
  return products.filter((product) => product.category === slug);
}

export function getFeaturedProducts(products: Product[]) {
  return products
    .filter((product) => product.id.startsWith("kli-") || product.id.startsWith("kli2-") || product.rating >= 4.7)
    .slice(0, 10);
}

export function getBestSellers(products: Product[]) {
  return [...products].sort((a, b) => b.reviews - a.reviews).slice(0, 10);
}

export function getNewArrivals(products: Product[]) {
  return products.filter((product) => product.id.startsWith("kli2-") || product.id.startsWith("kli-")).slice(0, 10);
}

export function getFlashDeals(products: Product[]) {
  return products.filter((product) => product.oldPrice && (1 - product.price / product.oldPrice) >= 0.15).slice(0, 12);
}
