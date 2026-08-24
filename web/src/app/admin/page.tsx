import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { getRecentRuns, getSourceHealth } from "@/lib/admin";
import type { ScraperRunStatus } from "@/lib/database.types";

export const metadata = { title: "Scraper health" };
// Monitoring is only useful if it is current.
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ScraperRunStatus, "calm" | "soon" | "urgent" | "outline"> = {
  success: "calm",
  partial: "soon",
  failed: "urgent",
  running: "outline",
};

export default async function AdminPage() {
  const profile = await getProfile();

  // 404 rather than 403: a non-admin has no business knowing this exists.
  if (!profile?.is_admin) notFound();

  const [health, runs] = await Promise.all([getSourceHealth(), getRecentRuns()]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scraper health</h1>
        <p className="text-sm text-muted-foreground">
          A source that starts failing usually means the site changed its markup. The
          warnings column catches that earlier — it fills up before a scraper breaks
          outright.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {health.map((source) => (
            <Card key={source.source_key}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{source.name}</CardTitle>
                  {source.last_run_status ? (
                    <Badge variant={STATUS_BADGE[source.last_run_status]}>
                      <StatusIcon status={source.last_run_status} />
                      {source.last_run_status}
                    </Badge>
                  ) : (
                    <Badge variant="outline">never run</Badge>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {source.source_key}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Stat label="Listings" value={source.total_opportunities} />
                  <Stat label="Last found" value={source.last_items_found ?? "—"} />
                  <Stat label="New" value={source.last_items_created ?? "—"} />
                  <Stat label="Failed" value={source.last_items_failed ?? "—"} />
                </dl>

                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {source.last_run_at
                    ? `${new Date(source.last_run_at).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}${
                        source.last_run_duration_ms
                          ? ` · ${(source.last_run_duration_ms / 1000).toFixed(1)}s`
                          : ""
                      }`
                    : "No run recorded"}
                </p>

                {source.last_error_message && (
                  <p className="rounded-md bg-urgent-muted/50 px-2.5 py-2 font-mono text-xs break-words text-urgent">
                    {source.last_error_message}
                  </p>
                )}

                {!source.enabled && <Badge variant="outline">disabled</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent runs</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <Th>Started</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th align="right">Found</Th>
                <Th align="right">New</Th>
                <Th align="right">Updated</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Warnings</Th>
                <Th align="right">Duration</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <Td className="whitespace-nowrap">
                    {new Date(run.started_at).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </Td>
                  <Td className="font-mono text-xs">{run.source_key}</Td>
                  <Td>
                    <Badge variant={STATUS_BADGE[run.status]}>{run.status}</Badge>
                  </Td>
                  <Td align="right">{run.items_found}</Td>
                  <Td align="right">{run.items_created}</Td>
                  <Td align="right">{run.items_updated}</Td>
                  <Td align="right" className={run.items_failed ? "text-urgent" : undefined}>
                    {run.items_failed}
                  </Td>
                  <Td align="right" className={run.warnings.length ? "text-soon" : undefined}>
                    {run.warnings.length}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </Td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No runs recorded yet.
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
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th scope="col" className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
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
  align?: "right";
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 ${align === "right" ? "text-right tabular-nums" : ""} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
