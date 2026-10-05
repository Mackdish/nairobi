import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, ArrowRight, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site-layout";

type BlogPost = {
  id: string; title: string; slug: string; excerpt: string | null; content: string;
  featured_image: string | null; category: string; tags: string[]; author_name: string;
  status: string; published_at: string | null; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
};

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Technology & Computer Buying Guides in Kenya | Intech Blog" },
      { name: "description", content: "Laptop buying guides, computer tips, technology advice and product insights for Nairobi and customers across Kenya." },
      { property: "og:title", content: "Technology & Computer Buying Guides | Intech Blog" },
      { property: "og:description", content: "Practical technology, laptop and computer buying guides from Intech Computer Shop in Nairobi." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://intechcomputershop.co.ke/blog" },
    ],
    links: [{ rel: "canonical", href: "https://intechcomputershop.co.ke/blog" }],
  }),
  component: BlogPage,
});

function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("blog_posts")
      .select("*")
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .then(({ data }) => { setPosts((data as BlogPost[]) ?? []); setLoading(false); });
  }, []);

  return (
    <SiteLayout>
      <main className="container mx-auto px-4 py-10">
        <section className="mb-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <BookOpen className="h-3.5 w-3.5" /> Intech Computer Shop Blog
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Technology, Computers & Buying Guides</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Practical laptop buying guides, computer tips, technology advice and product insights for customers in Nairobi and across Kenya.
          </p>
        </section>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading articles…</div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <h2 className="text-xl font-semibold">No articles published yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">New buying guides and technology articles will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <Link to="/blog/$slug" params={{ slug: post.slug }}>
                  {post.featured_image ? (
                    <img src={post.featured_image} alt={post.title} className="aspect-[16/9] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center bg-muted text-5xl">💻</div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">{post.category}</span>
                      {post.published_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(post.published_at)}</span>}
                    </div>
                    <h2 className="mt-4 text-xl font-bold leading-snug group-hover:text-primary">{post.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {post.excerpt || makeExcerpt(post.content)}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Read article <ArrowRight className="h-4 w-4" /></span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </SiteLayout>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(value));
}
function makeExcerpt(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 155) + (content.length > 155 ? "…" : "");
}