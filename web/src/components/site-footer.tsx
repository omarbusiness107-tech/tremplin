import type { Dictionary } from "@/i18n/dictionary";

export function SiteFooter({ dict }: { dict: Dictionary }) {
  return (
    <footer className="mt-16 border-t border-border-strong bg-foreground text-background">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[0.45fr_1fr]">
        <div>
          <p className="font-display text-lg font-bold">{dict.brand.name}</p>
          <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-background/55 uppercase">
            {dict.brand.tagline}
          </p>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-background/65">
          {dict.footer.disclaimer}
        </p>
      </div>
    </footer>
  );
}
