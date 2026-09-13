import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { fetchStorefrontProducts } from "@/lib/storefront-products";
import type { Product } from "@/lib/catalog";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_HISTORY = 8;
const MAX_PRODUCTS = 6;

type ChatMessage = { role: "user" | "assistant"; content: string };
type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<any> };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null) as { message?: unknown; history?: unknown; contextProductIds?: unknown } | null;
          const message = typeof body?.message === "string" ? body.message.trim() : "";
          if (!message || message.length > 1000) return Response.json({ error: "Please send a message between 1 and 1000 characters." }, { status: 400 });

          const ai = (env as unknown as { AI?: WorkersAi }).AI;
          if (!ai) return Response.json({ error: "Workers AI binding is not configured." }, { status: 503 });

          const history = Array.isArray(body?.history)
            ? body.history.filter((item): item is ChatMessage => !!item && typeof item === "object" &&
              (((item as ChatMessage).role === "user") || ((item as ChatMessage).role === "assistant")) && typeof (item as ChatMessage).content === "string").slice(-MAX_HISTORY)
            : [];
          const contextIds = Array.isArray(body?.contextProductIds)
            ? body.contextProductIds.filter((id): id is string => typeof id === "string").slice(0, MAX_PRODUCTS)
            : [];

          const userHistory = history.filter((item) => item.role === "user").map((item) => item.content).join(" ");
          const currentCategory = detectCategory(message);
          const budget = extractBudget(message) ?? extractBudget(userHistory);
          const contextProducts = contextIds.length ? (await fetchStorefrontProducts()).filter((p) => contextIds.includes(p.id)) : [];
          const isFollowUp = contextProducts.length > 0 && isFollowUpQuestion(message) && !currentCategory;
          const products = isFollowUp ? contextProducts : await searchProducts(`${userHistory} ${message}`.trim(), currentCategory, budget);
          const catalog = products.map(toCatalogContext);

          const messages = [
            { role: "system", content: [
              "You are Intech Computer Shop's AI shopping assistant in Kenya.",
              "Have a natural multi-turn shopping conversation and use the previous chat context.",
              "For follow-ups such as 'which has the best battery?', 'which is faster?', or 'compare them', evaluate the products currently supplied in the catalog results.",
              "When comparing products, mention the specific model names and explain the trade-off briefly.",
              "Be helpful, concise and sales-oriented without being pushy.",
              "Use only the supplied catalog for Intech product facts. Never invent names, prices, stock, specifications, discounts or store policies.",
              "Prices are in KES. Keep answers under 150 words.",
              catalog.length ? `CURRENT CATALOG RESULTS:\n${JSON.stringify(catalog)}` : "CURRENT CATALOG RESULTS: No matching products were found.",
            ].join("\n") },
            ...history,
            { role: "user", content: message },
          ];

          try {
            const response = await ai.run(MODEL, { messages, max_tokens: 400, temperature: 0.3 });
            const text = typeof response?.response === "string" ? response.response.trim() : "";
            return Response.json({ message: text || fallbackMessage(message, products), products, aiUnavailable: !text });
          } catch (aiError) {
            console.error("Workers AI inference error", aiError);
            return Response.json({ message: fallbackMessage(message, products), products, aiUnavailable: true });
          }
        } catch (error) {
          console.error("AI chat error", error);
          return Response.json({ message: "I can help you find laptops, TVs, phones and other products. Tell me what you need and your budget.", products: [], aiUnavailable: true });
        }
      },
    },
  },
});

async function searchProducts(query: string, currentCategory: string | null, budget: number | null): Promise<Product[]> {
  const allProducts = await fetchStorefrontProducts();
  const candidates = budget === null ? allProducts : allProducts.filter((product) => product.price <= budget);
  const category = currentCategory ?? detectCategory(query);
  const categoryCandidates = category ? candidates.filter((product) => matchesCategory(product, category)) : candidates;
  const pool = categoryCandidates.length ? categoryCandidates : candidates;
  const terms = tokenize(query);
  const scored = pool.map((product) => {
    const haystack = [product.name, product.brand, product.category, product.description, ...Object.entries(product.specs ?? {}).flat()].join(" ").toLowerCase();
    let score = product.stock > 0 ? 2 : -5;
    for (const term of terms) if (haystack.includes(term)) score += product.name.toLowerCase().includes(term) ? 5 : 1;
    if (category && matchesCategory(product, category)) score += 12;
    if (/gaming/.test(query.toLowerCase()) && /gaming|rtx|gtx|ryzen|core i[579]/.test(haystack)) score += 6;
    return { product, score };
  });
  scored.sort((a, b) => b.score - a.score || b.product.stock - a.product.stock);
  return scored.slice(0, MAX_PRODUCTS).map(({ product }) => product);
}

function isFollowUpQuestion(text: string) {
  return /\b(which|what|how|compare|difference|better|best|faster|cheaper|battery|performance|processor|ram|storage|screen|display|worth|one should|recommend)\b/i.test(text);
}

function detectCategory(text: string): string | null {
  const q = text.toLowerCase();
  if (/laptop|notebook/.test(q)) return "laptop";
  if (/tv|television/.test(q)) return "tv";
  if (/phone|smartphone|mobile/.test(q)) return "phone";
  if (/tablet/.test(q)) return "tablet";
  if (/printer/.test(q)) return "printer";
  if (/router|network|cctv|camera/.test(q)) return "network";
  if (/ssd|hard drive|hdd|flash drive|memory card|storage/.test(q)) return "storage";
  if (/keyboard|mouse|bag|battery|accessor/.test(q)) return "accessory";
  if (/gaming|game/.test(q)) return "gaming";
  return null;
}

function matchesCategory(product: Product, category: string) {
  const haystack = [product.name, product.category, product.description, ...Object.entries(product.specs ?? {}).flat()].join(" ").toLowerCase();
  const patterns: Record<string, RegExp> = {
    laptop: /laptop|notebook/, tv: /tv|television|smart tv/, phone: /phone|smartphone|mobile/, tablet: /tablet/, printer: /printer|toner|ink/, network: /router|network|cctv|camera/, storage: /ssd|hard drive|hdd|flash drive|memory card|storage/, accessory: /keyboard|mouse|bag|battery|accessor/, gaming: /gaming|rtx|gtx|ryzen|core i[579]/,
  };
  return patterns[category]?.test(haystack) ?? false;
}

function extractBudget(text: string): number | null {
  const match = text.match(/(?:ksh|kes|k\.?sh\.?)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,6})(?:\s*(?:k|ksh|kes))?/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value >= 1000 ? value : null;
}

function tokenize(text: string) {
  return text.replace(/ksh|kes|k\.?sh\.?|under|below|less than|budget|price|around|about|show me|find me|i need|i want/g, " ")
    .split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !["the", "and", "for", "with", "from", "best", "have", "you", "which", "what", "does", "that", "this"].includes(term));
}

function toCatalogContext(product: Product) {
  return { id: product.id, name: product.name, brand: product.brand, category: product.category, price: product.price, oldPrice: product.oldPrice, stock: product.stock, description: product.description, specs: product.specs };
}

function fallbackMessage(message: string, products: Product[]) {
  if (products.length) return `I found ${products.length} option${products.length === 1 ? "" : "s"} in our current catalog${extractBudget(message.toLowerCase()) ? " within your budget" : ""}. Check the products below.`;
  return "I couldn't find a matching product in our current catalog. Try another category or budget.";
}
