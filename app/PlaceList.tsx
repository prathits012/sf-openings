import Link from "next/link";
import { Place, slugFor, statusLabel } from "../lib/openings";

// Static, server-rendered list — used by the neighborhood & category SEO pages.
export default function PlaceList({
  title,
  subtitle,
  places,
}: {
  title: React.ReactNode;
  subtitle: string;
  places: Place[];
}) {
  return (
    <div className="listing">
      <Link className="back" href="/">← Map &amp; browse</Link>
      <h1>{title}</h1>
      <p className="lsub">{subtitle}</p>
      <div className="lrows">
        {places.map((p) => {
          const e = p.enrichment;
          const name = (e && e.display_name) || p.dba_name;
          const line = e && (e.hook || e.description);
          return (
            <Link key={p.uniqueid} className="card" href={`/openings/${slugFor(p)}`}>
              <div className="top">
                <div className="cardmain">
                  <div className="name">{name}</div>
                  <div className="hood">{p.neighborhood || "San Francisco"} · {p.address}</div>
                </div>
                <span className={"badge " + (p.status === "coming_soon" ? "coming_soon" : "open")}>
                  {statusLabel(p.status)}
                </span>
              </div>
              {line && <div className="hook">{line}</div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
