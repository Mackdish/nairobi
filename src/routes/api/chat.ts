import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/catalog";

const MODEL = "@cf/openai/gpt-oss-20b";
const MAX_HISTORY = 8;
const MAX_PRODUCTS = 6;
const MAX_TOOL_ROUNDS = 3;

type ChatMessage = { role: "user" | "assistant"; content: string };
type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<any> };
type ToolCall = { name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } };
type AiMessage = { role: string; content?: string | null };

type SearchArgs = {
  query?: string;
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  limit?: number;
};

const TOOLS = [
  {
    name: "search_products",
    description: "Search Intech Computer Shop's active product catalog by customer needs, category, budget, brand or specifications. Use this whenever the customer asks for products, recommendations, availability or prices.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language product need, e.g. gaming laptop, university laptop, 55 inch TV" },
        category: { type: "string", description: "Optional product category" },
        maxPrice: { type: "number", description: "Maximum price in Kenyan shillings" },
        minPrice: { type: "number", description: "Minimum price in Kenyan shillings" },
        limit: { type: "number", description: "Maximum number of products to return, from 1 to 6" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_product",
    description: "Get the complete current details of one product by its exact catalog ID.",
    parameters: {
      type: "object",
      properties: { productId: { type: "string", description: "The product ID from a previous catalog result" } },
      required: ["productId"],
    },
  },
  {
    name: "compare_products",
    description: "Compare two to four real Intech products using their catalog IDs. Use this when the customer asks which product is better or wants a comparison.",
    parameters: {
      type: "object",
      properties: { productIds: { type: "array", items: { type: "string" }, description: "Two to four product IDs" } },
      required: ["productIds"],
    },
  },
];

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

          const history = Array.isArray(body?.history)
            ? body.history
                .filter((item): item is ChatMessage => !!item && typeof item === "object" && (((item as ChatMessage).role === "user") || ((item as ChatMessage).role === "assistant")) && typeof (item as ChatMessage).content === "string")
                .slice(-MAX_HISTORY)
            : [];

          const ai = (env as unknown as { AI?: WorkersAi }).AI;
          if (!ai) return Response.json({ error: "Workers AI binding is not configured." }, { status: 503 });

          const messages: AiMessage[] = [
            {
              role: "system",
              content: [
                "You are Intech Computer Shop's AI shopping assistant in Kenya.",
                "Be helpful, concise and sales-oriented without being pushy.",
                "You have access to controlled catalog tools. Use them instead of guessing product information.",
                "Never invent product names, prices, stock, specifications, discounts or store policies.",
                "Prices are in KES. Keep the final response under 150 words.",
                "For product recommendations, always call search_products first. For comparisons, use compare_products with real product IDs.",
                "If the catalog does not contain a requested item, say so clearly and suggest a nearby category only when supported by tool results.",
                "You may answer general technology questions without a tool, but do not present general knowledge as an Intech store fact.",
              ].join("\n"),
            },
            ...history,
            { role: "user", content: message },
          ];

          const shownProducts = new Map<string, Product>();
          let response: any = null;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
            response = await ai.run(MODEL, {
              messages,
              tools: TOOLS,
              max_tokens: 400,
              temperature: 0.3,
            });

            const toolCalls: ToolCall[] = Array.isArray(response?.tool_calls) ? response.tool_calls : [];
            if (!toolCalls.length) break;

            // Workers AI traditional function calling returns { name, arguments }.
            // For the next inference round, use Cloudflare's documented traditional
            // format: an assistant message containing the selected tool JSON followed
            // by a role=tool message containing the function result.
            for (const call of toolCalls) {
              const name = call?.function?.name ?? call?.name ?? "";
              const rawArgs = call?.function?.arguments ?? call?.arguments ?? {};
              const args = parseArguments(rawArgs);
              let result: unknown;

              try {
                if (name === "search_products") {
                  const products = await searchProducts(args as SearchArgs);
                  products.forEach((product) => shownProducts.set(product.id, product));
                  result = products.map(toToolProduct);
                } else if (name === "get_product") {
                  const product = await getProduct(String(args.productId ?? ""));
                  if (product) shownProducts.set(product.id, product);
                  result = product ? toToolProduct(product) : { found: false, message: "Product not found." };
                } else if (name === "compare_products") {
                  const ids = Array.isArray(args.productIds) ? args.productIds.map(String).slice(0, 4) : [];
                  const products = await getProductsByIds(ids);
                  products.forEach((product) => shownProducts.set(product.id, product));
                  result = { products: products.map(toToolProduct), missingIds: ids.filter((id) => !products.some((product) => product.id === id)) };
                } else {
                  result = { error: "Unknown tool." };
                }
              } catch (error) {
                console.error(`AI tool ${name} error`, error);
                result = { error: "The catalog lookup failed. Please try again." };
              }

              messages.push({ role: "assistant", content: JSON.stringify({ name, arguments: args }) });
              messages.push({ role: "tool", content: JSON.stringify(result) });
            }
          }

          const finalMessage = typeof response?.response === "string" && response.response.trim()
            ? response.response.trim()
            : fallbackMessage([...shownProducts.values()]);

          return Response.json({
            message: finalMessage,
            products: [...shownProducts.values()].slice(0, MAX_PRODUCTS),
          });
        } catch (error) {
          console.error("AI chat error", error);
          return Response.json({ error: "Sorry, the shopping assistant is temporarily unavailable." }, { status: 500 });
        }
      },
    },
  },
});

async function searchProducts(args: SearchArgs): Promise<Product[]> {
  const query = String(args.query ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(args.limit) || MAX_PRODUCTS, 1), MAX_PRODUCTS);
  const maxPrice = finitePositive(args.maxPrice);
  const minPrice = finitePositive(args.minPrice);

  let request = supabase.from("products").select("*").eq("active", true).order("created_at", { ascending: false }).limit(100);
  if (maxPrice !== null) request = request.lte("price", maxPrice);
  if (minPrice !== null) request = request.gte("price", minPrice);
  if (args.category?.trim()) request = request.ilike("category", `%${escapeLike(args.category.trim())}%`);

  const { data, error } = await request;
  if (error) throw error;

  const products = (data ?? []).map(mapProduct);
  const terms = tokenize(query);
  const scored = products.map((product) => {
    const haystack = [product.name, product.brand, product.category, product.description, ...Object.entries(product.specs ?? {}).flat()].join(" ").toLowerCase();
    let score = product.stock > 0 ? 1 : -3;
    for (const term of terms) score += haystack.includes(term) ? (product.name.toLowerCase().includes(term) ? 5 : 1) : 0;
    if (/laptop|notebook/.test(query) && /laptop|notebook/.test(haystack)) score += 7;
    if (/tv|television/.test(query) && /tv|television/.test(haystack)) score += 7;
    if (/phone|smartphone|mobile/.test(query) && /phone|smartphone|mobile/.test(haystack)) score += 7;
    if (/printer/.test(query) && /printer/.test(haystack)) score += 7;
    if (/gaming/.test(query) && /gaming|rtx|gtx|ryzen|core i[579]/.test(haystack)) score += 4;
    return { product, score };
  });

  scored.sort((a, b) => b.score - a.score || b.product.stock - a.product.stock);
  return scored.slice(0, limit).map(({ product }) => product);
}

async function getProduct(id: string): Promise<Product | null> {
  if (!id || id.length > 100) return null;
  const { data, error } = await supabase.from("products").select("*").eq("id", id).eq("active", true).maybeSingle();
  if (error) throw error;
  return data ? mapProduct(data) : null;
}

async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const validIds = ids.filter((id) => id.length > 0 && id.length <= 100);
  if (!validIds.length) return [];
  const { data, error } = await supabase.from("products").select("*").in("id", validIds).eq("active", true);
  if (error) throw error;
  return (data ?? []).map(mapProduct);
}

function parseArguments(value: unknown): Record<string, any> {
  if (value && typeof value === "object") return value as Record<string, any>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function finitePositive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function tokenize(text: string) {
  return text
    .replace(/ksh|kes|k\.?sh\.?|under|below|less than|budget|price|around|about|show me|find me|i need|i want/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !["the", "and", "for", "with", "from", "best", "have", "you"].includes(term));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toToolProduct(product: Product) {
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

function fallbackMessage(products: Product[]) {
  return products.length
    ? `I found ${products.length} option${products.length === 1 ? "" : "s"} from our current catalog. Check the products below.`
    : "I couldn't find a matching product in our current catalog. Try another category or budget.";
}
