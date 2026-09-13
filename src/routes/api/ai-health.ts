import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

const MODEL = "@cf/openai/gpt-oss-20b";
type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<any> };

export const Route = createFileRoute("/api/ai-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ai = (env as unknown as { AI?: WorkersAi }).AI;
        const url = new URL(request.url);
        if (url.searchParams.get("deep") !== "1") {
          return Response.json({ ok: true, service: "intech-ai", aiBinding: Boolean(ai) });
        }

        if (!ai) {
          return Response.json({ ok: false, service: "intech-ai", error: "Workers AI binding is missing" }, { status: 503 });
        }

        try {
          const response = await ai.run(MODEL, {
            messages: [
              { role: "system", content: "Reply with exactly INTECH_AI_OK." },
              { role: "user", content: "Health check" },
            ],
            max_tokens: 16,
            temperature: 0,
          });

          return Response.json({
            ok: true,
            service: "intech-ai",
            model: MODEL,
            response: typeof response?.response === "string" ? response.response : null,
          });
        } catch (error) {
          console.error("Workers AI health check failed", error);
          return Response.json({
            ok: false,
            service: "intech-ai",
            model: MODEL,
            error: error instanceof Error ? error.message : String(error),
          }, { status: 500 });
        }
      },
    },
  },
});
