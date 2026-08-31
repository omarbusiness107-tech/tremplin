import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionary";
import { formatDate } from "@/i18n/format";
import { getProfile } from "@/lib/auth";
import { getRecentRuns, getSourceHealth } from "@/lib/admin";
import type { ScraperRunStatus } from "@/lib/database.types";

// Monitoring is only useful if it is current.
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ScraperRunStatus, "calm" | "soon" | "urgent" | "neutral"> = {
  success: "calm",
  partial: "soon",
  failed: "urgent",
  running: "neutral",
};

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;

  const [dict, profile] = await Promise.all([getDictionary(typed), getProfile()]);

  // 404 rather than 403: a non-admin has no business knowing this exists.
  if (!profile?.is_admin) notFound();

  const [health, runs] = await Promise.all([getSourceHealth(), getRecentRuns()]);
  const t = dict.admin;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <header className="border-b border-border pb-6">
        <p className="mb-3 text-xs font-bold tracking-[0.16em] text-primary uppercase">06 / {dict.nav.admin}</p>
        <h1 className="text-4xl font-bold sm:text-5xl">{t.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">{t.sources}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {health.map((source) => (
            <div
              key={source.source_key}
              className="flex flex-col gap-3 border border-border border-t-4 border-t-primary bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base font-semibold">{source.name}</h3>
                {source.last_run_status ? (
                  <Badge variant={STATUS_TONE[source.last_run_status]}>
                    <StatusIcon status={source.last_run_status} />
                    {source.last_run_status}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t.neverRun}</Badge>
                )}
              </div>
              <p className="font-mono text-[11px] text-subtle-foreground">{source.source_key}</p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Stat label={t.columns.listings} value={source.total_opportunities} />
                <Stat label={t.columns.found} value={source.last_items_found ?? "N/A"} />
                <Stat label={t.columns.new} value={source.last_items_created ?? "N/A"} />
                <Stat label={t.columns.failed} value={source.last_items_failed ?? "N/A"} />
              </dl>

              <p className="flex items-center gap-1.5 text-[11px] text-subtle-foreground">
                <Clock className="size-3.5" aria-hidden />
                {source.last_run_at
                  ? `${formatDate(source.last_run_at, typed, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}${
                      source.last_run_duration_ms
                        ? ` · ${(source.last_run_duration_ms / 1000).toFixed(1)}s`
                        : ""
                    }`
                  : t.noRunRecorded}
              </p>

              {source.last_error_message && (
                <p className="rounded-md bg-urgent-soft/60 px-2.5 py-2 font-mono text-[11px] break-words text-urgent">
                  {source.last_error_message}
                </p>
              )}

              {!source.enabled && <Badge variant="outline">{t.disabled}</Badge>}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">{t.recentRuns}</h2>
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-start text-[11px] tracking-wide text-subtle-foreground uppercase">
              <tr>
                <Th>{t.columns.started}</Th>
                <Th>{t.columns.source}</Th>
                <Th>{t.columns.status}</Th>
                <Th align="end">{t.columns.found}</Th>
                <Th align="end">{t.columns.new}</Th>
                <Th align="end">{t.columns.updated}</Th>
                <Th align="end">{t.columns.failed}</Th>
                <Th align="end">{t.columns.warnings}</Th>
                <Th align="end">{t.columns.duration}</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <Td className="whitespace-nowrap">
                    {formatDate(run.started_at, typed, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </Td>
                  <Td className="font-mono text-[11px]">{run.source_key}</Td>
                  <Td>
                    <Badge variant={STATUS_TONE[run.status]}>{run.status}</Badge>
                  </Td>
                  <Td align="end">{run.items_found}</Td>
                  <Td align="end">{run.items_created}</Td>
                  <Td align="end">{run.items_updated}</Td>
                  <Td align="end" className={run.items_failed ? "text-urgent" : undefined}>
                    {run.items_failed}
                  </Td>
                  <Td align="end" className={run.warnings.length ? "text-soon" : undefined}>
                    {run.warnings.length}
                  </Td>
                  <Td align="end" className="whitespace-nowrap">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "N/A"}
                  </Td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    {t.noRuns}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: ScraperRunStatus }) {
  const className = "size-3.5";
  if (status === "success") return <CheckCircle2 className={className} aria-hidden />;
  if (status === "failed") return <CircleSlash className={className} aria-hidden />;
  if (status === "partial") return <AlertTriangle className={className} aria-hidden />;
  return <Clock className={className} aria-hidden />;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] text-subtle-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "end" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 font-medium ${align === "end" ? "text-end" : "text-start"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "end";
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${align === "end" ? "text-end tabular-nums" : ""} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
