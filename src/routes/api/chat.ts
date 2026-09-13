import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/catalog";

const MODEL = "@cf/openai/gpt-oss-20b";
const MAX_HISTORY = 8;
const MAX_PRODUCTS = 6;

type ChatMessage = { role: "user" | "assistant"; content: string };
type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<any> };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null) as { message?: unknown; history?: unknown } | null;
          const message = typeof body?.message === "string" ? body.message.trim() : "";
          if (!message || message.length > 1000) {
            return Response.json({ error: "Please send a message between 1 and 1000 characters." }, { status: 400 });
          }

          const ai = (env as unknown as { AI?: WorkersAi }).AI;
          if (!ai) return Response.json({ error: "Workers AI binding is not configured." }, { status: 503 });

          const history = Array.isArray(body?.history)
            ? body.history
                .filter((item): item is ChatMessage => !!item && typeof item === "object" &&
                  (((item as ChatMessage).role === "user") || ((item as ChatMessage).role === "assistant")) &&
                  typeof (item as ChatMessage).content === "string")
                .slice(-MAX_HISTORY)
            : [];

          // Keep catalog retrieval deterministic and server-side. This deliberately avoids
          // putting the chatbot on the fragile tool-call round trip while the storefront is live.
          const products = await searchProductsForMessage(message);
          const catalog = products.map(toCatalogContext);

          const messages = [
            {
              role: "system",
              content: [
                "You are Intech Computer Shop's AI shopping assistant in Kenya.",
                "Be helpful, concise and sales-oriented without being pushy.",
                "Use only the supplied catalog for Intech product facts.",
                "Never invent product names, prices, stock, specifications, discounts or store policies.",
                "Prices are in KES. Keep the answer under 150 words.",
                catalog.length
                  ? `CURRENT CATALOG RESULTS:\n${JSON.stringify(catalog)}`
                  : "CURRENT CATALOG RESULTS: No matching products were found.",
              ].join("\n"),
            },
            ...history,
            { role: "user", content: message },
          ];

          try {
            const response = await ai.run(MODEL, {
              messages,
              max_tokens: 400,
              temperature: 0.3,
            });

            const text = typeof response?.response === "string" ? response.response.trim() : "";
            return Response.json({
              message: text || fallbackMessage(message, products),
              products,
            });
          } catch (aiError) {
            // A catalog result is still useful if model inference is temporarily unavailable.
            console.error("Workers AI inference error", aiError);
            return Response.json({
              message: fallbackMessage(message, products),
              products,
              aiUnavailable: true,
            });
          }
        } catch (error) {
          console.error("AI chat error", error);
          return Response.json({
            message: "I can help you find laptops, TVs, phones and other products. Tell me what you need and your budget.",
            products: [],
            aiUnavailable: true,
          });
        }
      },
    },
  },
});

async function searchProductsForMessage(message: string): Promise<Product[]> {
  const query = message.toLowerCase();
  const budget = extractBudget(query);

  let request = supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (budget !== null) request = request.lte("price", budget);

  const { data, error } = await request;
  if (error) {
    console.error("Supabase product search error", error);
    return [];
  }

  const products = (data ?? []).map(mapProduct);
  const terms = tokenize(query);
  const scored = products.map((product) => {
    const haystack = [
      product.name,
      product.brand,
      product.category,
      product.description,
      ...Object.entries(product.specs ?? {}).flat(),
    ].join(" ").toLowerCase();

    let score = product.stock > 0 ? 2 : -5;
    for (const term of terms) {
      if (haystack.includes(term)) score += product.name.toLowerCase().includes(term) ? 5 : 1;
    }

    if (/laptop|notebook/.test(query) && /laptop|notebook/.test(haystack)) score += 8;
    if (/tv|television/.test(query) && /tv|television/.test(haystack)) score += 8;
    if (/phone|smartphone|mobile/.test(query) && /phone|smartphone|mobile/.test(haystack)) score += 8;
    if (/tablet/.test(query) && /tablet/.test(haystack)) score += 8;
    if (/printer/.test(query) && /printer/.test(haystack)) score += 8;
    if (/gaming/.test(query) && /gaming|rtx|gtx|ryzen|core i[579]/.test(haystack)) score += 5;

    return { product, score };
  });

  scored.sort((a, b) => b.score - a.score || b.product.stock - a.product.stock);
  return scored.slice(0, MAX_PRODUCTS).map(({ product }) => product);
}

function extractBudget(text: string): number | null {
  const match = text.match(/(?:ksh|kes|k\.?sh\.?)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,6})(?:\s*(?:k|ksh|kes))?/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value >= 1000 ? value : null;
}

function tokenize(text: string) {
  return text
    .replace(/ksh|kes|k\.?sh\.?|under|below|less than|budget|price|around|about|show me|find me|i need|i want/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !["the", "and", "for", "with", "from", "best", "have", "you"].includes(term));
}

function toCatalogContext(product: Product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: product.price,
    oldPrice: product.oldPrice,
    stock: product.stock,
    description: product.description,
    specs: product.specs,
  };
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price) || 0,
    oldPrice: row.old_price == null ? undefined : Number(row.old_price),
    imageUrl: row.image_url ?? undefined,
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls : undefined,
    stock: Number(row.stock) || 0,
    description: row.description ?? "",
    brand: row.brand ?? "Intech",
    rating: Number(row.rating) || 0,
    reviews: Number(row.reviews) || 0,
    specs: row.specs ?? {},
    image: row.image ?? "📦",
    bg: row.bg ?? "bg-muted",
  } as Product;
}

function fallbackMessage(message: string, products: Product[]) {
  if (products.length) {
    return `I found ${products.length} option${products.length === 1 ? "" : "s"} in our current catalog${extractBudget(message.toLowerCase()) ? " within your budget" : ""}. Check the products below.`;
  }
  return "I couldn't find a matching product in our current catalog. Try another category or budget.";
}
