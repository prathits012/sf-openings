import type { Metadata } from "next";
import Link from "next/link";
import { recentlyOpened, recentlyDiscovered, slugFor, statusLabel } from "../../lib/openings";
import BrowseFooter from "../BrowseFooter";

export const metadata: Metadata = {
  title: "Updates — new SF openings this week | New in SF",
  description: "What just opened, and what's newly on the radar coming soon, across San Francisco.",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// This page is regenerated on every deploy (the daily pipeline pushes ->
// Vercel rebuilds -> this content refreshes). It's also the weekly-digest
// content in browsable form — same data feeds the newsletter later.
export default async function UpdatesPage(
  { searchParams }: { searchParams: Promise<{ range?: string }> }
) {
  const sp = await searchParams;
  const range = sp?.range === "30" ? 30 : sp?.range === "1" ? 1 : 7;
  const opened = recentlyOpened(range);
  const discovered = recentlyDiscovered(range);
  const label = range === 1 ? "today" : range === 30 ? "this month" : "this week";

  return (
    <div className="updates">
      <Link className="back" href="/">← Map &amp; browse</Link>
      <div className="top">
        <div>
          <h1>What's new in <span className="g">SF</span></h1>
          <p className="sub">{opened.length} place{opened.length === 1 ? "" : "s"} opened, {discovered.length} newly spotted — {label}.</p>
        </div>
        <div className="rangepick">
          <Link className={range === 1 ? "on" : ""} href="/updates?range=1">Today</Link>
          <Link className={range === 7 ? "on" : ""} href="/updates?range=7">This week</Link>
          <Link className={range === 30 ? "on" : ""} href="/updates?range=30">This month</Link>
        </div>
      </div>

      <div className="section">
        <h2><span className="n">{opened.length}</span> Just opened</h2>
        <div className="urow">
          {opened.length === 0 && <div className="empty">Nothing flipped open in this window yet.</div>}
          {opened.map((p) => {
            const e = p.enrichment;
            return (
              <Link key={p.uniqueid} className="uitem" href={`/openings/${slugFor(p)}`}>
                <div className="r1">
                  <span className="nm">{(e && e.display_name) || p.dba_name}</span>
                  <span className="wh">{p.neighborhood} · {timeAgo(p.flipped_at)}</span>
                </div>
                {e && (e.hook || e.description) && <div className="hk">{e.hook || e.description}</div>}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2><span className="n">{discovered.length}</span> Newly spotted — coming soon</h2>
        <div className="urow">
          {discovered.length === 0 && <div className="empty">No new permit filings in this window yet.</div>}
          {discovered.map((p) => {
            const e = p.enrichment;
            return (
              <Link key={p.uniqueid} className="uitem" href={`/openings/${slugFor(p)}`}>
                <div className="r1">
                  <span className="nm">{(e && e.display_name) || p.dba_name}</span>
                  <span className="wh">{p.neighborhood} · {statusLabel(p.status)}</span>
                </div>
                {e && (e.hook || e.description) && <div className="hk">{e.hook || e.description}</div>}
              </Link>
            );
          })}
        </div>
      </div>
      <BrowseFooter />
    </div>
  );
}
