import { FormEvent, useState } from "react";
import { Mail, Loader2 } from "lucide-react";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, website }),
      });

      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setStatus("success");
      setMessage("You're subscribed! Watch your inbox for Intech deals and updates.");
      setEmail("");
      setFirstName("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary-glow">
          <Mail className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Get Intech deals in your inbox</h4>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            New arrivals, selected offers and useful electronics updates. No spam.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="First name (optional)"
            maxLength={80}
            autoComplete="given-name"
            className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-primary-glow"
          />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Your email address"
            maxLength={254}
            autoComplete="email"
            required
            className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-primary-glow"
          />
        </div>

        <div className="hidden" aria-hidden="true">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "loading" ? "Subscribing..." : "Subscribe"}
        </button>
      </form>

      {message && (
        <p className={`mt-2 text-xs ${status === "error" ? "text-red-300" : "text-emerald-300"}`} role="status">
          {message}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-white/40">
        By subscribing, you agree to receive marketing emails from Intech Computer Shop. You can unsubscribe at any time.
      </p>
    </div>
  );
}
