import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai-health")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "intech-ai" }),
    },
  },
});
