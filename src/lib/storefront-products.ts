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

function buildProductDescription(name: string, brand: string, category: string, sourceDescription?: string | null) {
  const cleanName = name
    .replace(/[{}()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(promotion|special offer|limited hot offers|free mouse|hot offers)\s*[:!-]?\s*/i, "")
    .trim();

  const lower = cleanName.toLowerCase();
  const condition = /refurbished|renewed|used/i.test(lower) ? "refurbished" : "new";
  const cpu = cleanName.match(/(?:core\s+)?i[3579](?:\s+\d+(?:st|nd|rd|th)?\s*gen)?/i)?.[0];
  const ram = cleanName.match(/\b\d+\s*GB\s*(?:RAM)?\b/i)?.[0];
  const storage = cleanName.match(/\b\d+\s*(?:GB|TB)\s*(?:SSD|HDD)\b/i)?.[0];
  const screen = cleanName.match(/\b\d+(?:\.\d+)?["”]?\s*(?:inch(?:es)?)?\b/i)?.[0];
  const details = [cpu, ram, storage, screen].filter(Boolean).join(", ");

  if (sourceDescription && !/^(premium|genuine)\s+/i.test(sourceDescription.trim())) {
    return sourceDescription.trim();
  }

  const location = "Intech Computer Shop in Nairobi, Kenya";
  if (category === "laptops-desktops") {
    const useCase = /gaming|legion|rtx|playstation/i.test(lower)
      ? "gaming and demanding applications"
      : /thinkpad|elitebook|probook|latitude|lifebook/i.test(lower)
        ? "business, office and professional work"
        : /yoga|x360|touchscreen|2-in-1/i.test(lower)
          ? "study, mobility and everyday productivity"
          : "work, study and everyday computing";
    return `${cleanName} is a ${condition} ${brand} computer designed for ${useCase}. ${details ? `Key specifications include ${details}. ` : ""}Buy from ${location} with Nairobi delivery and nationwide shipping.`;
  }

  const categoryCopy: Record<string, string> = {
    tvs: "Enjoy home entertainment with a practical display solution for streaming, TV and everyday viewing.",
    "phones-tablets": "A practical mobile device for communication, entertainment, study and everyday productivity.",
    "computer-accessories": "A useful computer accessory for improving your everyday workstation setup and productivity.",
    "data-storage": "A practical storage solution for backing up, transferring and managing your files.",
    printers: "A practical printing solution for home, school and office use.",
    "cctv-networking": "A reliable networking and security solution for home, office and business environments.",
    "scanners-projectors": "A practical solution for presentations, teaching, meetings and office workflows.",
    gaming: "Built for an engaging gaming and entertainment setup.",
    "antivirus-software": "Security software designed to help protect your devices and digital files.",
    audio: "A convenient audio accessory for calls, music and everyday entertainment.",
    ups: "Power protection equipment designed to help keep compatible electronics running during power interruptions.",
    ac: "A practical cooling solution for comfortable indoor spaces.",
    fridges: "A practical home appliance for reliable food and beverage storage.",
  };

  return `${cleanName} from ${brand} is ${categoryCopy[category] ?? "a practical technology product for everyday use."} ${details ? `Key details: ${details}. ` : ""}Available at ${location} with Nairobi delivery and nationwide shipping.`;
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
    name: row.name,
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
