import Link from "next/link";
import { allNeighborhoods, allCategories } from "../lib/openings";

// Internal-linking footer: gives users a browse index AND gives crawlers a path
// to every neighborhood/category page from any page that renders it.
export default function BrowseFooter() {
  const hoods = allNeighborhoods();
  const cats = allCategories();
  return (
    <footer className="bfoot">
      <div className="bcols">
        <div className="bcol">
          <h3>By neighborhood</h3>
          <div className="blinks">
            {hoods.map((n) => (
              <Link key={n.slug} href={`/neighborhood/${n.slug}`}>{n.name} <span>{n.count}</span></Link>
            ))}
          </div>
        </div>
        <div className="bcol">
          <h3>By category</h3>
          <div className="blinks">
            {cats.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`}>{c.label} <span>{c.count}</span></Link>
            ))}
          </div>
        </div>
      </div>
      <div className="bcredit">
        Data from <a href="https://data.sfgov.org/" target="_blank" rel="noopener noreferrer">DataSF</a>, confirmed via web search.
        {" · "}<Link href="/">Map &amp; browse</Link>{" · "}<Link href="/updates">Updates</Link>
      </div>
    </footer>
  );
}
