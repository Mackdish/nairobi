import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Toaster } from "@/components/ui/sonner";
import { InstallPrompt } from "./install-prompt";
import type { ReactNode } from "react";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <InstallPrompt />
      <Toaster position="top-right" richColors />
    </div>
  );
}
