import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site-layout";

type BlogPost = {
  id: string; title: string; slug: string; excerpt: string | null; content: string;
  featured_image: string | null; category: string; tags: string[]; author_name: string;
  status: string; published_at: string | null; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
};

export const Route = createFileRoute("/blog/$slug")({
  head: () => ({
    meta: [
      { title: "Blog Article | Intech Computer Shop" },
      { name: "description", content: "Technology and computer buying advice from Intech Computer Shop in Nairobi, Kenya." },
      { property: "og:type", content: "article" },
    ],
  }),
  component: BlogArticlePage,
});

function BlogArticlePage() {
  const { slug } = Route.useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .maybeSingle()
      .then(({ data }) => { setPost(data as BlogPost | null); setLoading(false); });
  }, [slug]);

  if (loading) return <SiteLayout><div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Loading article…</div></SiteLayout>;
  if (!post) return <SiteLayout><div className="container mx-auto max-w-2xl px-4 py-20 text-center"><h1 className="text-3xl font-bold">Article not found</h1><Link to="/blog" className="mt-5 inline-flex text-primary hover:underline">← Back to blog</Link></div></SiteLayout>;

  const canonical = `https://intechcomputershop.co.ke/blog/${encodeURIComponent(post.slug)}`;
  const description = post.seo_description || post.excerpt || makeExcerpt(post.content);

  return (
    <SiteLayout>
      <article className="container mx-auto max-w-4xl px-4 py-10">
        <Link to="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /> All articles</Link>
        <div className="mt-7">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">{post.category}</span>
            {post.published_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{formatDate(post.published_at)}</span>}
            <span>By {post.author_name}</span>
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>
          {post.excerpt && <p className="mt-5 text-xl leading-8 text-muted-foreground">{post.excerpt}</p>}
          {post.featured_image && <img src={post.featured_image} alt={post.title} className="mt-8 aspect-[16/8] w-full rounded-2xl object-cover" />}
        </div>

        <div className="prose prose-stone mt-10 max-w-none dark:prose-invert">
          {renderContent(post.content)}
        </div>

        {post.tags?.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t pt-6">
            {post.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">#{tag}</span>)}
          </div>
        )}
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description,
        image: post.featured_image ? [post.featured_image] : undefined,
        datePublished: post.published_at,
        dateModified: post.updated_at,
        author: { "@type": "Person", name: post.author_name },
        publisher: { "@type": "Organization", name: "Intech Computer Shop", url: "https://intechcomputershop.co.ke/" },
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        keywords: post.tags?.join(", "),
      }) }} />
    </SiteLayout>
  );
}

function renderContent(content: string) {
  return content.split(/\n\s*\n/).filter(Boolean).map((block, i) => {
    const text = block.trim();
    if (text.startsWith("### ")) return <h3 key={i}>{text.slice(4)}</h3>;
    if (text.startsWith("## ")) return <h2 key={i}>{text.slice(3)}</h2>;
    if (text.startsWith("# ")) return <h2 key={i}>{text.slice(2)}</h2>;
    return <p key={i}>{text}</p>;
  });
}
function formatDate(value: string) { return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(value)); }
function makeExcerpt(content: string) { return content.replace(/\s+/g, " ").trim().slice(0, 155) + (content.length > 155 ? "…" : ""); }