import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

const RESEND_CONTACTS_URL = "https://api.resend.com/contacts";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 80;

type NewsletterBody = {
  email?: unknown;
  firstName?: unknown;
  website?: unknown;
};

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export const Route = createFileRoute("/api/newsletter")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as NewsletterBody | null;

          // Honeypot: bots should fill this field; legitimate forms leave it empty.
          if (typeof body?.website === "string" && body.website.trim()) {
            return Response.json({ ok: true });
          }

          const email = normalizeEmail(body?.email);
          const firstName = normalizeName(body?.firstName);

          if (!email) {
            return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
          }

          const apiKey = getEnv("RESEND_API_KEY");
          if (!apiKey) {
            console.error("RESEND_API_KEY is not configured.");
            return Response.json({ error: "Newsletter signup is temporarily unavailable." }, { status: 503 });
          }

          const contactResult = await resendRequest<ResendResponse>(
            RESEND_CONTACTS_URL,
            apiKey,
            "POST",
            JSON.stringify({
              email,
              ...(firstName ? { first_name: firstName } : {}),
              unsubscribed: false,
            }),
          );

          const duplicate = !contactResult.ok && isDuplicateContact(contactResult.data);
          if (!contactResult.ok && !duplicate) {
            console.error("Resend contact creation failed", contactResult.data);
            return Response.json({ error: "We couldn't subscribe you right now. Please try again." }, { status: 502 });
          }

          let welcomeSent = false;
          const fromEmail = getEnv("RESEND_FROM_EMAIL");

          // Only send a welcome email for a newly-created contact. Existing contacts
          // can still receive future broadcasts from Resend without duplicate welcomes.
          if (!duplicate && fromEmail) {
            const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
            const emailResult = await resendRequest<ResendResponse>(
              RESEND_EMAILS_URL,
              apiKey,
              "POST",
              JSON.stringify({
                from: fromEmail,
                to: [email],
                subject: "Welcome to Intech Computer Shop",
                html: buildWelcomeEmail(greeting),
              }),
            );

            if (!emailResult.ok) {
              console.error("Resend welcome email failed", emailResult.data);
            } else {
              welcomeSent = true;
            }
          }

          return Response.json({
            ok: true,
            alreadySubscribed: duplicate,
            welcomeSent,
          });
        } catch (error) {
          console.error("Newsletter signup error", error);
          return Response.json({ error: "We couldn't process your signup right now." }, { status: 500 });
        }
      },
    },
  },
});

function getEnv(name: "RESEND_API_KEY" | "RESEND_FROM_EMAIL") {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

async function resendRequest<T>(url: string, apiKey: string, method: "POST", body: string) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "IntechComputerShop/1.0",
    },
    body,
  });

  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, data };
}

function isDuplicateContact(data: ResendResponse) {
  const message = `${data?.message ?? ""} ${data?.name ?? ""}`.toLowerCase();
  return message.includes("already") || message.includes("exist") || message.includes("duplicate");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function buildWelcomeEmail(greeting: string) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033;">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
      <div style="background:#0b1220;border-radius:14px 14px 0 0;padding:22px;color:#fff;font-size:20px;font-weight:700;">Intech Computer Shop</div>
      <div style="background:#fff;border-radius:0 0 14px 14px;padding:28px;">
        <p style="font-size:16px;">${greeting}</p>
        <h1 style="font-size:24px;margin:0 0 12px;">Welcome to Intech!</h1>
        <p style="line-height:1.6;color:#4b5563;">Thanks for joining our email list. We'll share selected deals, new arrivals and useful computer and electronics updates from Intech Computer Shop.</p>
        <p style="line-height:1.6;color:#4b5563;">We keep our emails useful and relevant. You can unsubscribe whenever you choose.</p>
        <a href="https://intechcomputershop.co.ke" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Shop Intech</a>
        <p style="margin-top:28px;font-size:12px;color:#9ca3af;">Intech Computer Shop · Nairobi, Kenya</p>
      </div>
    </div>
  </body>
</html>`;
}
