import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Send, Clock, Users, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/email-marketing")({ component: EmailMarketing });

function EmailMarketing() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [html, setHtml] = useState(defaultTemplate);
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendCampaign(sendNow: boolean) {
    if (!user) return;
    setLoading(true); setMessage(""); setError("");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your admin session has expired. Please sign in again.");
      const response = await fetch("/api/admin-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ subject, previewText, html, sendNow, scheduledAt }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Campaign could not be sent.");
      setMessage(sendNow ? "Campaign sent successfully to the configured Resend audience." : "Campaign scheduled successfully.");
      if (sendNow) { setSubject(""); setPreviewText(""); setHtml(defaultTemplate); }
    } catch (e) { setError(e instanceof Error ? e.message : "Campaign could not be sent."); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6 text-primary" /> Bulk Email Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">Send promotional emails and announcements to your Resend marketing audience.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-xl border bg-card p-5 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Marketing audience</div>
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Recipients are managed through your configured Resend audience. Unsubscribed contacts are handled by Resend.</div>
          <div>
            <label className="text-sm font-medium">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} placeholder="e.g. New laptops just arrived 🔥" className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-sm font-medium">Preview text <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input value={previewText} onChange={e => setPreviewText(e.target.value)} maxLength={200} placeholder="Short text shown beside the subject in inboxes" className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-sm font-medium">Email content (HTML)</label>
            <textarea value={html} onChange={e => setHtml(e.target.value)} rows={18} spellCheck={false} className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/30" />
            <p className="mt-1 text-xs text-muted-foreground">Use HTML for product offers, images, buttons and links. Include an unsubscribe link in marketing emails.</p>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 h-fit space-y-5">
          <h2 className="font-semibold">Campaign actions</h2>
          <div className="rounded-lg border p-4 text-sm">
            <div className="font-medium">Send now</div>
            <p className="mt-1 text-muted-foreground">Immediately create and send the campaign to the Resend audience.</p>
            <button disabled={loading || !subject.trim() || !html.trim()} onClick={() => sendCampaign(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" />{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Bulk Email"}</button>
          </div>
          <div className="border-t pt-5">
            <div className="font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Schedule</div>
            <p className="mt-1 text-sm text-muted-foreground">Schedule the campaign for a future date and time.</p>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-3 w-full rounded-md border bg-background px-3 py-2.5" />
            <button disabled={loading || !subject.trim() || !html.trim() || !scheduledAt} onClick={() => sendCampaign(false)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"><Clock className="h-4 w-4" /> Schedule Campaign</button>
          </div>
          {message && <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</div>}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </section>
      </div>
    </div>
  );
}

const defaultTemplate = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;color:#172033">
  <h1>Intech Computer Shop</h1>
  <h2>Your next tech upgrade is here 🚀</h2>
  <p>Discover our latest computers, accessories and electronics at great prices.</p>
  <p><a href="https://intechcomputershop.co.ke" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Shop Now</a></p>
  <p style="font-size:12px;color:#777">You are receiving this email because you subscribed to Intech Computer Shop marketing emails. Unsubscribe anytime using the link provided by Resend.</p>
</div>`;
