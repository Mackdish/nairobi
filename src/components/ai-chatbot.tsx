import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, ChevronRight, MessageCircle, Send, ShoppingCart, Sparkles, X } from "lucide-react";
import { useCart } from "@/lib/store";
import type { Product } from "@/lib/catalog";
import { KES } from "@/lib/catalog";
import { toast } from "sonner";

type ChatProduct = Pick<Product, "id" | "name" | "price" | "oldPrice" | "imageUrl" | "image" | "brand" | "stock" | "bg">;
type Message = { role: "user" | "assistant"; content: string; products?: ChatProduct[] };

const starters = [
  "I need a laptop under KSh 70,000",
  "Show me the best laptops for university",
  "Do you have TVs under KSh 50,000?",
];

export function AiChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm Intech's AI shopping assistant. Tell me what you're looking for, your budget, or a product you want to compare." },
  ]);
  const add = useCart((s) => s.add);

  async function sendMessage(text = input) {
    const value = text.trim();
    if (!value || loading) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", content: value }]);
    setLoading(true);

    try {
      const contextProductIds = Array.from(new Set(messages.flatMap((message) => message.products?.map((product) => product.id) ?? []))).slice(-6);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: value,
          history: messages.slice(-8).map(({ role, content }) => ({ role, content })),
          contextProductIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "The assistant is unavailable right now.");
      setMessages((current) => [...current, { role: "assistant", content: data.message || "I couldn't find a useful answer. Please try another request.", products: data.products }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error instanceof Error ? error.message : "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open && (
        <section className="fixed z-[60] bottom-20 right-3 sm:right-5 w-[calc(100vw-1.5rem)] max-w-[420px] h-[min(680px,calc(100vh-6rem))] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-background/15 grid place-items-center"><Bot className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0"><div className="font-extrabold">Intech AI Assistant</div><div className="text-xs opacity-80">Product recommendations • Prices • Stock</div></div>
            <button onClick={() => setOpen(false)} aria-label="Close chatbot" className="h-9 w-9 grid place-items-center rounded-full hover:bg-background/15"><X className="h-5 w-5" /></button>
          </header>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2.5 text-sm" : "max-w-[92%] rounded-2xl rounded-bl-sm bg-accent px-3 py-2.5 text-sm"}>
                  <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                  {message.products?.length ? <div className="mt-3 space-y-2">{message.products.map((product) => <ChatProductCard key={product.id} product={product} onAdd={() => { add(product as Product); toast.success("Added to cart", { description: product.name }); }} />)}</div> : null}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-accent rounded-2xl rounded-bl-sm px-4 py-3 text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 animate-pulse" /> Finding the best options…</div></div>}
          </div>

          {messages.length === 1 && <div className="px-3 pb-2 flex gap-2 overflow-x-auto">{starters.map((starter) => <button key={starter} onClick={() => sendMessage(starter)} className="shrink-0 text-xs border border-border rounded-full px-3 py-2 hover:bg-accent">{starter}</button>)}</div>}

          <form onSubmit={(e) => { e.preventDefault(); void sendMessage(); }} className="p-3 border-t border-border flex gap-2 bg-background">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about laptops, TVs, phones…" className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-border bg-muted/30 outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Send message" className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </section>
      )}

      <button onClick={() => setOpen((value) => !value)} aria-label="Open Intech AI Assistant" className="fixed z-[59] bottom-4 right-4 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl grid place-items-center hover:scale-105 transition-transform">{open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}</button>
    </>
  );
}

function ChatProductCard({ product, onAdd }: { product: ChatProduct; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex gap-2 p-2">
        <div className={`h-16 w-16 rounded-lg shrink-0 overflow-hidden ${product.bg}`}>
          {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-2xl">{product.image}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-xs line-clamp-2">{product.name}</div>
          <div className="text-brand font-extrabold text-sm mt-1">{KES(product.price)}</div>
          {product.oldPrice && product.oldPrice > product.price ? <div className="text-[10px] text-muted-foreground line-through">{KES(product.oldPrice)}</div> : null}
          <div className="text-[10px] text-success mt-0.5">{product.stock > 0 ? `In stock (${product.stock})` : "Out of stock"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border">
        <Link to="/product/$id" params={{ id: product.id }} className="h-9 text-xs font-semibold grid place-items-center gap-1 hover:bg-accent">View Product <ChevronRight className="h-3 w-3" /></Link>
        <button onClick={onAdd} disabled={product.stock <= 0} className="h-9 text-xs font-bold border-l border-border hover:bg-accent disabled:opacity-40 inline-flex items-center justify-center gap-1"><ShoppingCart className="h-3.5 w-3.5" /> Add to Cart</button>
      </div>
    </div>
  );
}
