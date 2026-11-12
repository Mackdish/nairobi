import { createFileRoute } from "@tanstack/react-router";
import { CATEGORIES } from "@/lib/catalog";
import { fetchStorefrontProducts } from "@/lib/storefront-products";
import { supabase } from "@/integrations/supabase/client";
import { EDITORIAL_POSTS } from "@/lib/editorial-posts";

const SITE = "https://intechcomputershop.co.ke";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const products = await fetchStorefrontProducts();
        const { data: posts } = await supabase.from("blog_posts").select("slug, published_at").eq("status", "published").not("published_at", "is", null).lte("published_at", new Date().toISOString());
        const publishedSlugs = new Set([...EDITORIAL_POSTS.map((post) => post.slug), ...(posts ?? []).map((post) => post.slug)]);
        const urls = [
          `${SITE}/`,
          `${SITE}/blog`,
          ...CATEGORIES.map((category) => `${SITE}/category/${encodeURIComponent(category.slug)}`),
          ...products.map((product) => `${SITE}/product/${encodeURIComponent(product.id)}`),
          ...Array.from(publishedSlugs).map((slug) => `${SITE}/blog/${encodeURIComponent(slug)}`),
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
