import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, Pencil, Plus, Trash2, Eye, Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/blog")({ component: AdminBlogPage });

type Post = {
  id: string; title: string; slug: string; excerpt: string | null; content: string;
  featured_image: string | null; category: string; tags: string[]; author_name: string;
  status: string; published_at: string | null; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
};
type Form = Omit<Post, "id" | "created_at" | "updated_at">;
const EMPTY: Form = {
  title: "", slug: "", excerpt: "", content: "", featured_image: "", category: "Buying Guides",
  tags: [], author_name: "Intech Computer Shop", status: "draft", published_at: null, seo_title: "", seo_description: ""
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
function normalizeTags(value: string) {
  return value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
}
function AdminBlogPage() {
  const [posts,setPosts]=useState<Post[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState("");
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Post|null>(null);

  async function load() {
    setLoading(true);
    const {data,error}=await supabase.from("blog_posts").select("*").order("created_at",{ascending:false});
    if(error) toast.error(error.message); else setPosts((data as Post[]) ?? []);
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  const filtered=useMemo(()=>{
    const q=query.toLowerCase().trim();
    return q ? posts.filter(p=>p.title.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||p.status.includes(q)) : posts;
  },[posts,query]);

  async function remove(id:string) {
    const {error}=await supabase.from("blog_posts").delete().eq("id",id);
    if(error) toast.error(error.message); else { setPosts(x=>x.filter(p=>p.id!==id)); toast.success("Article deleted"); }
  }

  async function togglePublish(post:Post) {
    const published=post.status==="published";
    const {data,error}=await supabase.from("blog_posts").update({
      status: published ? "draft" : "published",
      published_at: published ? null : new Date().toISOString(),
    }).eq("id",post.id).select("*").single();
    if(error) toast.error(error.message);
    else { setPosts(x=>x.map(p=>p.id===post.id?data as Post:p)); toast.success(published?"Moved to draft":"Article published"); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Blog Management</h1><p className="text-sm text-muted-foreground">Create, optimize and publish articles that appear on the public blog.</p></div>
      <Button onClick={()=>{setEditing(null);setOpen(true);}}><Plus className="h-4 w-4"/> New article</Button>
    </div>
    <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search articles…"/></div>
    {loading ? <div className="py-12 text-center text-muted-foreground">Loading articles…</div> :
      <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 text-left">Article</th><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Published</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>
      {filtered.map(p=><tr key={p.id} className="border-t"><td className="px-4 py-3"><div className="font-medium">{p.title}</div><div className="text-xs text-muted-foreground">/blog/{p.slug}</div></td><td className="px-4 py-3">{p.category}</td><td className="px-4 py-3"><Badge variant={p.status==="published"?"default":"secondary"}>{p.status}</Badge></td><td className="px-4 py-3 text-muted-foreground">{p.published_at?new Date(p.published_at).toLocaleDateString("en-KE"):"—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={()=>{setEditing(p);setOpen(true)}} title="Edit"><Pencil className="h-4 w-4"/></Button>{p.status==="published"&&<Button variant="ghost" size="icon" asChild title="View"><a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer"><Eye className="h-4 w-4"/></a></Button>}<Button variant="ghost" size="icon" onClick={()=>togglePublish(p)} title={p.status==="published"?"Unpublish":"Publish"}><BookOpen className="h-4 w-4"/></Button><Button variant="ghost" size="icon" onClick={()=>remove(p.id)} title="Delete"><Trash2 className="h-4 w-4 text-destructive"/></Button></div></td></tr>)}
      {filtered.length===0&&<tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No articles found.</td></tr>}
    </tbody></table></div>}
    <Dialog open={open} onOpenChange={setOpen}><BlogEditor post={editing} onClose={()=>setOpen(false)} onSaved={p=>{setPosts(x=>{const i=x.findIndex(y=>y.id===p.id);return i<0?[p,...x]:x.map(y=>y.id===p.id?p:y)});setOpen(false)}}/></Dialog>
  </div>;
}

function BlogEditor({post,onClose,onSaved}:{post:Post|null;onClose:()=>void;onSaved:(p:Post)=>void}) {
  const [form,setForm]=useState<Form>(()=>post?{...post,tags:post.tags??[]}:{...EMPTY});
  const [saving,setSaving]=useState(false);
  const set=(key:keyof Form,value:any)=>setForm(f=>({...f,[key]:value}));
  async function save(e:React.FormEvent) {
    e.preventDefault();
    if(!form.title.trim()||!form.content.trim()){toast.error("Title and content are required");return;}
    setSaving(true);
    const payload={...form,title:form.title.trim(),slug:slugify(form.slug||form.title),excerpt:form.excerpt?.trim()||null,featured_image:form.featured_image?.trim()||null,seo_title:form.seo_title?.trim()||null,seo_description:form.seo_description?.trim()||null,tags:form.tags,status:form.status,published_at:form.status==="published"?(form.published_at||new Date().toISOString()):null};
    const q=post?supabase.from("blog_posts").update(payload).eq("id",post.id).select("*").single():supabase.from("blog_posts").insert(payload).select("*").single();
    const {data,error}=await q;
    setSaving(false);
    if(error){toast.error(error.message);return;}
    toast.success(form.status==="published"?"Article published":"Draft saved");
    onSaved(data as Post);
  }
  return <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{post?"Edit article":"Create article"}</DialogTitle></DialogHeader>
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><Label>Title</Label><Input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Best Laptops for Students in Kenya"/></div>
      <div className="space-y-2"><Label>URL slug</Label><Input value={form.slug} onChange={e=>set("slug",e.target.value)} placeholder="best-laptops-for-students-in-kenya"/></div>
      <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={e=>set("category",e.target.value)} placeholder="Buying Guides"/></div>
      <div className="space-y-2 md:col-span-2"><Label>Excerpt</Label><Textarea value={form.excerpt??""} onChange={e=>set("excerpt",e.target.value)} rows={2} placeholder="Short summary shown on the blog listing and used as a fallback meta description."/></div>
      <div className="space-y-2 md:col-span-2"><Label>Article content</Label><Textarea value={form.content} onChange={e=>set("content",e.target.value)} rows={16} placeholder={"Write your article here. Use blank lines between paragraphs.\n\nUse ## Heading for section headings."}/><p className="text-xs text-muted-foreground">Plain text editor: separate paragraphs with blank lines. Use #, ## or ### at the start of a line for headings.</p></div>
      <div className="space-y-2"><Label>Featured image URL</Label><Input value={form.featured_image??""} onChange={e=>set("featured_image",e.target.value)} placeholder="https://…"/></div>
      <div className="space-y-2"><Label>Tags</Label><Input value={form.tags.join(", ")} onChange={e=>set("tags",normalizeTags(e.target.value))} placeholder="laptops, computers, Kenya, buying guide"/></div>
      <div className="space-y-2"><Label>Author</Label><Input value={form.author_name} onChange={e=>set("author_name",e.target.value)}/></div>
      <div className="space-y-2"><Label>Status</Label><select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.status} onChange={e=>set("status",e.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></div>
      <div className="space-y-2 md:col-span-2"><Label>SEO title</Label><Input value={form.seo_title??""} onChange={e=>set("seo_title",e.target.value)} placeholder="Leave blank to use article title"/></div>
      <div className="space-y-2 md:col-span-2"><Label>SEO description</Label><Textarea value={form.seo_description??""} onChange={e=>set("seo_description",e.target.value)} rows={2} placeholder="Write a compelling search description (about 150–160 characters)."/></div></div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving&&<Loader2 className="h-4 w-4 animate-spin"/>}{form.status==="published"?"Publish article":"Save draft"}</Button></DialogFooter>
    </form>
  </DialogContent>;
}