import type { Dictionary } from "@/i18n/dictionary";

export function SiteFooter({ dict }: { dict: Dictionary }) {
  return (
    <footer className="mt-16 border-t border-border bg-surface-sunken">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p className="max-w-3xl text-xs leading-relaxed text-subtle-foreground">
          {dict.footer.disclaimer}
        </p>
      </div>
    </footer>
  );
}
