"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const COLORS: Record<string, string> = {
  open: "#3ddc84",
  just_opened: "#3ddc84",
  coming_soon: "#f0b45e",
};

type P = {
  uniqueid: string;
  dba_name: string;
  address: string;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  permit_start: string | null;
  slug: string;
  enrichment: any | null;
};

const statusClass = (s: string) => (s === "coming_soon" ? "coming_soon" : "open");
const statusLabel = (s: string) =>
  s === "coming_soon" ? "Coming soon" : s === "just_opened" ? "Just opened" : "Open";
const hasStory = (p: P) =>
  !!(p.enrichment && p.enrichment.model && p.enrichment.model !== "stub-no-key" &&
     (p.enrichment.description || p.enrichment.hook));
const nameOf = (p: P) => (p.enrichment && p.enrichment.display_name) || p.dba_name;

export default function MapBrowse({ places }: { places: P[] }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const glRef = useRef<any>(null);

  const byId = useMemo(() => {
    const m: Record<string, P> = {};
    for (const p of places) m[p.uniqueid] = p;
    return m;
  }, [places]);

  const visible = useMemo(() => {
    return places.filter((p) => {
      if (p.status === "cancelled") return false;
      if (filter === "open") return p.status === "open" || p.status === "just_opened";
      if (filter === "coming_soon") return p.status === "coming_soon";
      if (filter === "enriched") return hasStory(p);
      return true;
    });
  }, [places, filter]);

  const stats = useMemo(() => {
    const live = places.filter((p) => p.status !== "cancelled");
    return {
      total: live.length,
      open: live.filter((p) => p.status === "open" || p.status === "just_opened").length,
      soon: live.filter((p) => p.status === "coming_soon").length,
    };
  }, [places]);

  const geo = useMemo(
    () => ({
      type: "FeatureCollection",
      features: visible
        .filter((p) => p.lat != null)
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { id: p.uniqueid, status: p.status, story: hasStory(p) ? 1 : 0 },
        })),
    }),
    [visible]
  );

  // init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapEl.current) return;
      glRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {
            c: {
              type: "raster",
              tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap © CARTO",
            },
          },
          layers: [{ id: "c", type: "raster", source: "c" }],
        },
        center: [-122.437, 37.767],
        zoom: 12,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("pts", { type: "geojson", data: geo as any });
        map.addLayer({
          id: "halo", type: "circle", source: "pts",
          filter: ["==", ["get", "story"], 1],
          paint: {
            "circle-radius": 11,
            "circle-color": ["match", ["get", "status"], "coming_soon", COLORS.coming_soon, COLORS.open],
            "circle-opacity": 0.18,
          },
        });
        map.addLayer({
          id: "dots", type: "circle", source: "pts",
          paint: {
            "circle-radius": ["case", ["==", ["get", "story"], 1], 6, 4],
            "circle-color": ["match", ["get", "status"], "coming_soon", COLORS.coming_soon, COLORS.open],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#0d1117",
          },
        });
        map.on("click", "dots", (e: any) => selectPlace(e.features[0].properties.id, true));
        map.on("mouseenter", "dots", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "dots", () => (map.getCanvas().style.cursor = ""));
      });
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update source when filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.getSource && map.getSource("pts")) map.getSource("pts").setData(geo);
  }, [geo]);

  function selectPlace(id: string, fly: boolean) {
    setSelected(id);
    const p = byId[id];
    if (!p || p.lat == null) return;
    const map = mapRef.current;
    const maplibregl = glRef.current;
    if (fly && map) map.flyTo({ center: [p.lng, p.lat], zoom: 15, speed: 0.8 });
    if (map && maplibregl) {
      if (popupRef.current) popupRef.current.remove();
      const e = p.enrichment || {};
      popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: false })
        .setLngLat([p.lng, p.lat])
        .setHTML(
          `<div class="pn">${esc(nameOf(p))}</div><div class="ph">${esc(p.neighborhood || "")} · ${statusLabel(p.status)}</div>` +
            (e.description ? `<div class="pd">${esc(e.description)}</div>` : "")
        )
        .addTo(map);
    }
    setTimeout(() => {
      const el = document.querySelector(".card.sel");
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  const rows = useMemo(() => {
    return visible.slice().sort((a, b) => {
      const sa = (hasStory(a) ? 2 : 0) + (a.status !== "coming_soon" ? 1 : 0);
      const sb = (hasStory(b) ? 2 : 0) + (b.status !== "coming_soon" ? 1 : 0);
      if (sa !== sb) return sb - sa;
      return (b.permit_start || "").localeCompare(a.permit_start || "");
    });
  }, [visible]);

  return (
    <div className="app">
      <div className="panel">
        <header>
          <div className="titlerow">
            <h1>New in <span className="g">SF</span></h1>
            <Link href="/updates" className="updatesLink">Updates →</Link>
          </div>
          <p className="sub">Cafes &amp; retail opening across the city — from permit filings, confirmed live.</p>
          <div className="stats">
            <div className="stat"><div className="n">{stats.total}</div><div className="l">tracked</div></div>
            <div className="stat"><div className="n open">{stats.open}</div><div className="l">open</div></div>
            <div className="stat"><div className="n soon">{stats.soon}</div><div className="l">coming soon</div></div>
          </div>
        </header>
        <div className="filters">
          {[["all", "All"], ["open", "Open"], ["coming_soon", "Coming soon"], ["enriched", "Has story"]].map(
            ([s, label]) => (
              <div key={s} className={"chip" + (filter === s ? " active" : "")} data-s={s}
                   onClick={() => setFilter(s)}>{label}</div>
            )
          )}
        </div>
        <div className="list">
          {rows.length === 0 && <div className="empty">No places match.</div>}
          {rows.map((p) => {
            const e = p.enrichment || {};
            const meta: string[] = [];
            if (hasStory(p)) meta.push(`confidence ${Math.round((e.confidence || 0) * 100)}%`);
            if (e.opening_date) meta.push(`opened ${e.opening_date}`);
            if (e.sources && e.sources.length) meta.push(`${e.sources.length} sources`);
            return (
              <div key={p.uniqueid} className={"card" + (selected === p.uniqueid ? " sel" : "")}
                   onClick={() => selectPlace(p.uniqueid, true)}>
                <div className="top">
                  <div>
                    <div className="name">{nameOf(p)}</div>
                    <div className="hood">{p.neighborhood || "San Francisco"} · {p.address}</div>
                  </div>
                  <span className={"badge " + statusClass(p.status)}>{statusLabel(p.status)}</span>
                </div>
                {e.hook && <div className="hook">{e.hook}</div>}
                {e.description && <div className="desc">{e.description}</div>}
                {e.tags && e.tags.length > 0 && (
                  <div className="tags">{e.tags.slice(0, 5).map((t: string) => <span key={t} className="tag">{t}</span>)}</div>
                )}
                {meta.length > 0 && <div className="meta">{meta.map((m) => <span key={m}>{m}</span>)}</div>}
                <div className="meta">
                  <Link href={`/openings/${p.slug}`} onClick={(ev) => ev.stopPropagation()}>View details →</Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mapwrap" ref={mapEl} />
    </div>
  );
}

function esc(s: any) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string)
  );
}
