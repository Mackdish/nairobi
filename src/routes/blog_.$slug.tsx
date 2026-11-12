import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site-layout";
import { EDITORIAL_POSTS } from "@/lib/editorial-posts";

type BlogPost = {
  id: string; title: string; slug: string; excerpt: string | null; content: string;
  featured_image: string | null; category: string; tags: string[]; author_name: string;
  status: string; published_at: string | null; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
};

export const Route = createFileRoute("/blog_/$slug")({
  head: ({ params }) => {
    const post = EDITORIAL_POSTS.find((item) => item.slug === params.slug);
    const title = post?.seo_title || post?.title || "Technology & Computer Advice | Intech Computer Shop";
    const description = post?.seo_description || post?.excerpt || "Technology and computer buying advice from Intech Computer Shop in Nairobi, Kenya.";
    const canonical = `https://intechcomputershop.co.ke/blog/${encodeURIComponent(params.slug)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: post?.title || title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: BlogArticlePage,
});

function BlogArticlePage() {
  const { slug } = Route.useParams();
  const editorialPost = EDITORIAL_POSTS.find((item) => item.slug === slug) ?? null;
  const [post, setPost] = useState<BlogPost | null>(editorialPost);
  const [loading, setLoading] = useState(!editorialPost);

  useEffect(() => {
    // Editorial articles are bundled with the site. Render them immediately instead
    // of waiting for Supabase, which may be unavailable or contain an older duplicate.
    if (editorialPost) {
      setPost(editorialPost);
      setLoading(false);
      return;
    }

    let active = true;
    setPost(null);
    setLoading(true);

    supabase.from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setPost(!error && data ? (data as BlogPost) : null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setPost(null);
        setLoading(false);
      });

    return () => { active = false; };
  }, [slug, editorialPost]);

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
          {post.featured_image && <img referrerPolicy="no-referrer" src={post.featured_image} alt={post.title} className="mt-8 aspect-[16/8] w-full rounded-2xl object-cover" />}
        </div>

        <div className="prose prose-stone mt-10 max-w-none dark:prose-invert">
          {renderContent(post.content || "")}
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
  const blocks = content.replace(/\r/g, "").split(/\n\s*\n/).filter((item) => item.trim());
  return blocks.map((block, index) => {
    const lines = block.trim().split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";

    if (lines.length === 1 && first.startsWith("### ")) return <h3 key={index}>{first.slice(4)}</h3>;
    if (lines.length === 1 && first.startsWith("## ")) return <h2 key={index}>{first.slice(3)}</h2>;
    if (lines.length === 1 && first.startsWith("# ")) return <h2 key={index}>{first.slice(2)}</h2>;

    const isList = lines.length > 0 && lines.every((line) => /^(- |\* |\d+\. )/.test(line));
    if (isList) {
      const ordered = /^\d+\. /.test(lines[0]);
      const items = lines.map((line) => line.replace(/^(?:- |\* |\d+\. )/, ""));
      return ordered
        ? <ol key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol>
        : <ul key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
    }

    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{line}{lineIndex < lines.length - 1 ? " " : ""}</span>)}</p>;
  });
}
function formatDate(value: string) { return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(value)); }
function makeExcerpt(content: string) { return content.replace(/\s+/g, " ").trim().slice(0, 155) + (content.length > 155 ? "…" : ""); }