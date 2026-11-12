// Placeholder for the "cloudflare:workers" module in the static SPA build.
// The /api/* server routes that import it only run on the Cloudflare Worker
// build; in the cPanel SPA bundle they are never executed.
export const env: Record<string, unknown> = {};
