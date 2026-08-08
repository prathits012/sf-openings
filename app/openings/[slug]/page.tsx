import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { livePlaces, placeBySlug, slugFor, statusLabel } from "../../../lib/openings";

// Pre-render one static page per opening at build time — this is the SEO engine.
export function generateStaticParams() {
  return livePlaces().map((p) => ({ slug: slugFor(p) }));
}

export const dynamicParams = false;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const p = placeBySlug(slug);
  if (!p) return { title: "Opening not found — New in SF" };
  const e = p.enrichment;
  const where = p.neighborhood ? ` in ${p.neighborhood}` : "";
  const title = `${p.dba_name} — ${statusLabel(p.status)}${where} | New in SF`;
  const description =
    (e && (e.description || e.hook)) ||
    `${p.dba_name} is a newly registered business at ${p.address}, San Francisco.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function OpeningPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = placeBySlug(slug);
  if (!p) notFound();
  const e = p.enrichment;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: p.dba_name,
    address: { "@type": "PostalAddress", streetAddress: p.address, addressLocality: "San Francisco", addressRegion: "CA" },
    ...(p.lat != null ? { geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } } : {}),
    ...(e && e.website ? { url: e.website } : {}),
    ...(e && e.opening_date ? { foundingDate: e.opening_date } : {}),
  };

  return (
    <div className="detail">
      <Link className="back" href="/">← All SF openings</Link>
      <h1>{p.dba_name}</h1>
      <div className="loc">{p.neighborhood ? `${p.neighborhood} · ` : ""}{p.address}</div>
      <span className={"badge " + (p.status === "coming_soon" ? "coming_soon" : "open")}>{statusLabel(p.status)}</span>

      {e && e.hook && <p className="hook">{e.hook}</p>}
      {e && e.description && <p className="desc">{e.description}</p>}
      {e && e.tags && e.tags.length > 0 && (
        <div className="tags">{e.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
      )}

      <dl className="facts">
        <dt>Status</dt><dd>{statusLabel(p.status)}</dd>
        {e && e.opening_date && (<><dt>Opened</dt><dd>{e.opening_date}</dd></>)}
        {p.permit_start && (<><dt>Permit filed</dt><dd>{p.permit_start}</dd></>)}
        <dt>Neighborhood</dt><dd>{p.neighborhood || "San Francisco"}</dd>
      </dl>

      {e && (e.website || e.instagram) && (
        <div className="links">
          {e.website && <a href={e.website} target="_blank" rel="noopener noreferrer">Website</a>}
          {e.instagram && (
            <a href={e.instagram.startsWith("http") ? e.instagram : `https://instagram.com/${e.instagram.replace(/^@/, "")}`}
               target="_blank" rel="noopener noreferrer">Instagram</a>
          )}
        </div>
      )}

      {e && e.sources && e.sources.length > 0 && (
        <div className="src">
          Sources
          {e.sources.slice(0, 5).map((s) => (
            <a key={s} href={s} target="_blank" rel="noopener noreferrer">{s}</a>
          ))}
        </div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
