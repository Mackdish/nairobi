import { fetchStorefrontProducts } from "@/lib/storefront-products";
import type { Product } from "@/lib/catalog";

export function rankProducts(products: Product[], query: string, max = 6) {
  const normalized = query.toLowerCase();
  const terms = tokenize(normalized);
  const scored = products.map((product) => {
    const haystack = [product.name, product.brand, product.category, product.description, ...Object.entries(product.specs ?? {}).flat()].join(" ").toLowerCase();
    let score = product.stock > 0 ? 2 : -5;
    for (const term of terms) if (haystack.includes(term)) score += product.name.toLowerCase().includes(term) ? 5 : 1;
    if (/laptop|notebook/.test(normalized) && /laptop|notebook/.test(haystack)) score += 12;
    if (/tv|television/.test(normalized) && /tv|television/.test(haystack)) score += 12;
    if (/phone|smartphone|mobile/.test(normalized) && /phone|smartphone|mobile/.test(haystack)) score += 12;
    if (/tablet/.test(normalized) && /tablet/.test(haystack)) score += 12;
    if (/printer/.test(normalized) && /printer/.test(haystack)) score += 12;
    if (/gaming/.test(normalized) && /gaming|rtx|gtx|ryzen|core i[579]/.test(haystack)) score += 6;
    return { product, score };
  });
  scored.sort((a, b) => b.score - a.score || b.product.stock - a.product.stock);
  return scored.slice(0, max).map(({ product }) => product);
}

export async function getProductsByIds(ids: string[]) {
  if (!ids.length) return [];
  const products = await fetchStorefrontProducts();
  const wanted = new Set(ids);
  return products.filter((product) => wanted.has(product.id));
}

export function extractBudget(text: string): number | null {
  const match = text.match(/(?:ksh|kes|k\.?sh\.?)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,6})(?:\s*(?:k|ksh|kes))?/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value >= 1000 ? value : null;
}

export function tokenize(text: string) {
  return text.replace(/ksh|kes|k\.?sh\.?|under|below|less than|budget|price|around|about|show me|find me|i need|i want/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !["the", "and", "for", "with", "from", "best", "have", "you", "which", "what", "does", "that", "this"].includes(term));
}

export function toCatalogContext(product: Product) {
  return { id: product.id, name: product.name, brand: product.brand, category: product.category, price: product.price, oldPrice: product.oldPrice, stock: product.stock, description: product.description, specs: product.specs };
}
