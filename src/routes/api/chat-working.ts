import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/catalog";

const MODEL = "@cf/openai/gpt-oss-20b";

type ChatMessage = { role: "user" | "assistant"; content: string };
type AI = { run: (model: string, input: Record<string, unknown>) => Promise<any> };

export const Route = createFileRoute("/api/chat-working")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const body = await request.json() as { message?: string; history?: ChatMessage[] };
      const message = body.message?.trim();
      if (!message || message.length > 1000) return Response.json({ error: "Invalid message." }, { status: 400 });
      const { data, error } = await supabase.from("products").select("*").eq("active", true).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const products = (data ?? []).map(mapProduct);
      const matches = rankProducts(products, message).slice(0, 6);
      const context = matches.map((p) => ({ id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, oldPrice: p.oldPrice, stock: p.stock, description: p.description, specs: p.specs }));
      const ai = (env as unknown as { AI?: AI }).AI;
      if (!ai) return Response.json({ error: "Workers AI binding is not configured." }, { status: 503 });
      const result = await ai.run(MODEL, { messages: [
        { role: "system", content: `You are Intech Computer Shop's AI shopping assistant in Kenya. Use only the supplied catalog data. Never invent products, prices, stock, specifications or policies. Be concise and helpful. Prices are KES.\nCATALOG:\n${JSON.stringify(context)}` },
        ...(body.history ?? []).slice(-8),
        { role: "user", content: message },
      ], max_tokens: 300, temperature: 0.4 });
      return Response.json({ message: result.response ?? result.result?.response ?? result.result?.output_text ?? "I found some options below.", products: matches });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "The shopping assistant is temporarily unavailable." }, { status: 500 });
    }
  } } },
});

function rankProducts(products: Product[], query: string) {
  const q = query.toLowerCase();
  const budgetMatch = q.match(/(?:under|below|budget|around|about)?\s*(?:ksh|kes|k)?\s*(\d+(?:\.\d+)?)\s*k?/i);
  let budget = budgetMatch ? Number(budgetMatch[1]) : null;
  if (budget !== null && /k|ksh|kes|thousand/i.test(budgetMatch?.[0] ?? "")) budget *= 1000;
  const terms = q.split(/[^a-z0-9]+/).filter((x) => x.length > 2);
  return products.map((product) => {
    const haystack = [product.name, product.brand, product.category, product.description, ...Object.entries(product.specs ?? {}).flat()].join(" ").toLowerCase();
    let score = product.stock > 0 ? 0.5 : -2;
    for (const term of terms) if (haystack.includes(term)) score += product.name.toLowerCase().includes(term) ? 4 : 1;
    if (budget !== null) score += product.price <= budget ? 5 : -2;
    if (/laptop|notebook/.test(q) && /laptop|notebook/.test(haystack)) score += 6;
    if (/tv|television/.test(q) && /tv|television/.test(haystack)) score += 6;
    if (/phone|smartphone|mobile/.test(q) && /phone|smartphone|mobile/.test(haystack)) score += 6;
    if (/printer/.test(q) && /printer/.test(haystack)) score += 6;
    return { product, score };
  }).sort((a, b) => b.score - a.score).map((x) => x.product);
}

function mapProduct(row: any): Product {
  return { id: row.id, name: row.name, category: row.category, price: Number(row.price) || 0, oldPrice: row.old_price == null ? undefined : Number(row.old_price), imageUrl: row.image_url ?? undefined, imageUrls: Array.isArray(row.image_urls) ? row.image_urls : undefined, stock: Number(row.stock) || 0, description: row.description ?? "", brand: row.brand ?? "Intech", rating: Number(row.rating) || 0, reviews: Number(row.reviews) || 0, specs: row.specs ?? {}, image: row.image ?? "📦", bg: row.bg ?? "bg-muted" } as Product;
}
