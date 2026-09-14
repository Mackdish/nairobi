import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { env } from "cloudflare:workers";

const RESEND_BROADCASTS_URL = "https://api.resend.com/broadcasts";

type BroadcastBody = { subject?: unknown; html?: unknown; previewText?: unknown; sendNow?: unknown; scheduledAt?: unknown };

export const Route = createFileRoute("/api/admin-broadcast")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireAdmin(request);
      if (!user) return Response.json({ error: "Admin access required." }, { status: 403 });
      const body = (await request.json().catch(() => null)) as BroadcastBody | null;
      const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const html = typeof body?.html === "string" ? body.html.trim() : "";
      const previewText = typeof body?.previewText === "string" ? body.previewText.trim() : "";
      const sendNow = body?.sendNow === true;
      const scheduledAt = typeof body?.scheduledAt === "string" ? body.scheduledAt.trim() : "";
      if (!subject || subject.length > 150) return Response.json({ error: "Subject is required and must be 150 characters or fewer." }, { status: 400 });
      if (!html || html.length > 200_000) return Response.json({ error: "Email content is required and must be under 200,000 characters." }, { status: 400 });
      if (!sendNow && !scheduledAt) return Response.json({ error: "Choose Send now or provide a scheduled date and time." }, { status: 400 });
      if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) return Response.json({ error: "Please provide a valid scheduled date and time." }, { status: 400 });

      const apiKey = getEnv("RESEND_API_KEY");
      const audienceId = getEnv("RESEND_AUDIENCE_ID");
      const fromEmail = getEnv("RESEND_FROM_EMAIL");
      if (!apiKey || !audienceId || !fromEmail) return Response.json({ error: "Email marketing is not fully configured. Add the Resend API, audience and sender secrets." }, { status: 503 });

      const response = await fetch(RESEND_BROADCASTS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": "IntechComputerShop/1.0" },
        body: JSON.stringify({ audience_id: audienceId, from: fromEmail, subject, html, ...(previewText ? { preview_text: previewText } : {}), ...(sendNow ? { send: true } : { scheduled_at: scheduledAt }) }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        console.error("Resend broadcast failed", data);
        return Response.json({ error: data.message || "Resend could not create the campaign." }, { status: 502 });
      }
      return Response.json({ ok: true, id: data.id, sent: sendNow, scheduled: !sendNow, userId: user.id });
    } catch (error) {
      console.error("Admin broadcast error", error);
      return Response.json({ error: "Unable to process the email campaign." }, { status: 500 });
    }
  } } },
});

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!token || !supabaseUrl || !supabaseKey) return null;
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await client.auth.getUser(token);
  if (userError || !user) return null;
  const { data: role, error: roleError } = await client.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return roleError || !role ? null : user;
}

function getEnv(name: "RESEND_API_KEY" | "RESEND_AUDIENCE_ID" | "RESEND_FROM_EMAIL" | "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY") {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}
