import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/catalog";

const MODEL = "@cf/openai/gpt-oss-20b";
const MAX_HISTORY = 8;
const MAX_PRODUCTS = 6;
type ChatMessage = { role: "user" | "assistant"; content: string };
type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

type AiResponse = { response?: string; result?: { response?: string; output_text?: string } };

export const Route = createFileRoute("/api/chat-v2")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const body = await request.json().catch(() => null) as { message?: unknown; history?: unknown } | null;
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 1000) return Response.json({ error: "Please send a message between 1 and 1000 characters." }, { status: 400 });
      const history = Array.isArray(body?.history) ? body.history.filter((item): item is ChatMessage => !!item && typeof item === "object" && (((item as ChatMessage).role === "user") || ((item as ChatMessage).role === "assistant")) && typeof (item as ChatMessage).content === "string").slice(-MAX_HISTORY) : [];
      const products = await searchProducts(message);
      const productContext = products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, oldPrice: p.oldPrice, stock: p.stock, description: p.description, specs: p.specs }));
      const systemPrompt = ["You are Intech Computer Shop's AI shopping assistant for customers in Kenya.", "Be helpful, concise, friendly, and sales-oriented without being pushy.", "Only recommend products contained in PRODUCT DATA below. Never invent product names, prices, stock, specifications, discounts, delivery promises, or policies.", "Prices are in Kenyan Shillings (KES). If PRODUCT DATA is empty, say you could not find a matching product and suggest refining the request.", "When recommending products, mention why they fit the customer's request and use exact prices from the data.", "Keep normal replies under about 150 words.", "PRODUCT DATA:\n" + JSON.stringify(productContext)].join("\n\n");
      const ai = (env as unknown as { AI?: WorkersAi }).AI;
      if (!ai) return Response.json({ message: "The AI assistant is not configured yet. Please add the Workers AI binding and try again.", products: products.slice(0, MAX_PRODUCTS) }, { status: 503 });
      const result = await ai.run(MODEL, { messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }], max_tokens: 300, temperature: 0.4 }) as AiResponse;
      return Response.json({ message: result.response ?? result.result?.response ?? result.result?.output_text ?? fallbackMessage(products), products: products.slice(0, MAX_PRODUCTS) });
    } catch (error) { console.error("AI chat error", error); return Response.json({ error: "Sorry, the shopping assistant is temporarily unavailable." }, { status: 500 }); }
  } } },
});

async function searchProducts(query: string): Promise<Product[]> {
  const normalized = query.toLowerCase();
  const budget = extractBudget(normalized);
  const { data, error } = await supabase.from("products").select("*").eq("active", true).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const products = (data ?? []).map(mapProduct);
  const terms = normalized.replace(/ksh|kes|k\.?sh\.?|under|below|less than|budget|price|around|about|show me|find me|i need|i want/g, " ").split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !["the", "and", "for", "with", "from", "best", "have", "you"].includes(term));
  const scored = products.map((product) => {
    const haystack = [product.name, product.brand, product.category, product.description, ...Object.entries(product.specs ?? {}).flat()].join(" ").toLowerCase();
    let score = 0;
    for (const term of terms) if (haystack.includes(term)) score += product.name.toLowerCase().includes(term) ? 4 : 1;
    if (budget !== null) score += product.price <= budget ? 5 : -Math.min(5, (product.price - budget) / Math.max(budget, 1));
    if (normalized.includes("laptop") && /laptop|notebook/i.test(product.category + product.name)) score += 6;
    if (normalized.includes("tv") && /tv|television/i.test(product.category + product.name)) score += 6;
    if (normalized.includes("phone") && /phone|mobile|smartphone/i.test(product.category + product.name)) score += 6;
    if (normalized.includes("printer") && /printer/i.test(product.category + product.name)) score += 6;
    if (product.stock > 0) score += 0.5;
    return { product, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const meaningful = scored.filter((item) => item.score > 0 || budget !== null);
  return (meaningful.length ? meaningful : scored).slice(0, MAX_PRODUCTS).map((item) => item.product);
}

function extractBudget(text: string): number | null {
  const match = text.match(/(?:under|below|less than|max|budget(?: of)?|around|about)?\s*(?:ksh|kes|k\.?sh\.?)?\s*(\d+(?:\.\d+)?)\s*(k|kilo|thousand)?/i);
  if (!match) return null;
  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2]) amount *= 1000;
  return amount >= 1000 ? amount : null;
}

function mapProduct(row: any): Product {
  return { id: row.id, name: row.name, category: row.category, price: Number(row.price) || 0, oldPrice: row.old_price == null ? undefined : Number(row.old_price), imageUrl: row.image_url ?? undefined, imageUrls: Array.isArray(row.image_urls) ? row.image_urls : undefined, stock: Number(row.stock) || 0, description: row.description ?? "", brand: row.brand ?? "Intech", rating: Number(row.rating) || 0, reviews: Number(row.reviews) || 0, specs: row.specs ?? {}, image: row.image ?? "📦", bg: row.bg ?? "bg-muted" } as Product;
}
function fallbackMessage(products: Product[]) { return products.length ? `I found ${products.length} option${products.length === 1 ? "" : "s"} that may fit. Check the products below for prices and stock.` : "I couldn't find a matching product in our current catalog. Try another category or budget."; }
