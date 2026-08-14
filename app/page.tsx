import { livePlaces, slugFor } from "../lib/openings";
import MapBrowse from "./MapBrowse";

// Home = the browse experience. Server component loads the data (no DB), then
// hands a slim list to the client map/feed component.
export default function Home() {
  const places = livePlaces().map((p) => ({
    uniqueid: p.uniqueid,
    dba_name: p.dba_name,
    address: p.address,
    neighborhood: p.neighborhood,
    naics: p.naics,
    lat: p.lat,
    lng: p.lng,
    status: p.status,
    permit_start: p.permit_start,
    flipped_at: p.flipped_at,
    slug: slugFor(p),
    enrichment: p.enrichment,
  }));
  return <MapBrowse places={places} />;
}
