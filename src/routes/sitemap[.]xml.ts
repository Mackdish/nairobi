import { createFileRoute } from "@tanstack/react-router";
import { CATEGORIES } from "@/lib/catalog";
import { fetchStorefrontProducts } from "@/lib/storefront-products";

const SITE = "https://intechcomputershop.co.ke";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const products = await fetchStorefrontProducts();
        const urls = [
          `${SITE}/`,
          ...CATEGORIES.map((category) => `${SITE}/category/${encodeURIComponent(category.slug)}`),
          ...products.map((product) => `${SITE}/product/${encodeURIComponent(product.id)}`),
        ];

        const uniqueUrls = [...new Set(urls)];
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueUrls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
</urlset>`;

        return new Response(sitemap, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
