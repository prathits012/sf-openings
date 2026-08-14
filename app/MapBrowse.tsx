"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSaves } from "../lib/useSaves";

const COLORS: Record<string, string> = {
  open: "#3ddc84",
  just_opened: "#3ddc84",
  coming_soon: "#f0b45e",
};

const tilesUrl = (t: string) =>
  `https://basemaps.cartocdn.com/${t === "dark" ? "dark_all" : "light_all"}/{z}/{x}/{y}.png`;
const CLUSTER: Record<string, { fill: string; stroke: string; text: string; halo: string }> = {
  light: { fill: "#ffffff", stroke: "#c7cfd8", text: "#161b22", halo: "#0d1117" },
  dark: { fill: "#1b2530", stroke: "#3a4756", text: "#e9edf1", halo: "#0d1117" },
};
const currentTheme = () =>
  (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) || "light";

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
const lineOf = (p: P) => {
  const e = p.enrichment || {};
  return e.hook || e.description || null; // feed shows ONE line; full text on detail
};

export default function MapBrowse({ places }: { places: P[] }) {
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"list" | "map">("list"); // mobile only
  const [query, setQuery] = useState("");
  const [hood, setHood] = useState("all");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const { toggle, isSaved, count: savedCount } = useSaves();

  useEffect(() => setTheme(currentTheme() as "light" | "dark"), []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("sf-theme", next); } catch {}
    const m = mapRef.current;
    if (m && m.getSource) {
      const src = m.getSource("c");
      if (src && src.setTiles) src.setTiles([tilesUrl(next)]);
      if (m.getLayer("clusters")) {
        m.setPaintProperty("clusters", "circle-color", CLUSTER[next].fill);
        m.setPaintProperty("clusters", "circle-stroke-color", CLUSTER[next].stroke);
      }
      if (m.getLayer("cluster-count")) m.setPaintProperty("cluster-count", "text-color", CLUSTER[next].text);
      if (m.getLayer("dots")) m.setPaintProperty("dots", "circle-stroke-color", CLUSTER[next].halo);
    }
  }
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const glRef = useRef<any>(null);

  const byId = useMemo(() => {
    const m: Record<string, P> = {};
    for (const p of places) m[p.uniqueid] = p;
    return m;
  }, [places]);

  const neighborhoods = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places) {
      if (p.status === "cancelled" || !p.neighborhood) continue;
      m.set(p.neighborhood, (m.get(p.neighborhood) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [places]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      if (p.status === "cancelled") return false;
      if (filter === "open" && !(p.status === "open" || p.status === "just_opened")) return false;
      if (filter === "coming_soon" && p.status !== "coming_soon") return false;
      if (filter === "saved" && !isSaved(p.uniqueid)) return false;
      if (hood !== "all" && p.neighborhood !== hood) return false;
      if (q) {
        const hay = `${nameOf(p)} ${p.neighborhood || ""} ${p.address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [places, filter, hood, query, isSaved]);

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

  // init map once — with clustering so 300+ pins don't overlap into noise
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapEl.current) return;
      glRef.current = maplibregl;
      const t0 = currentTheme();
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          // Glyphs so the cluster-count text can render (raster styles have none).
          glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
          sources: {
            c: {
              type: "raster",
              tiles: [tilesUrl(t0)],
              tileSize: 256,
              attribution: "© OpenStreetMap © CARTO",
            },
          },
          layers: [{ id: "c", type: "raster", source: "c" }],
        },
        center: [-122.437, 37.767],
        zoom: 11.5,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("pts", {
          type: "geojson",
          data: geo as any,
          cluster: true,
          clusterRadius: 46,
          clusterMaxZoom: 15,
        });
        // Cluster bubbles
        map.addLayer({
          id: "clusters", type: "circle", source: "pts",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": CLUSTER[t0].fill,
            "circle-stroke-color": CLUSTER[t0].stroke,
            "circle-stroke-width": 1,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 30, 30],
          },
        });
        map.addLayer({
          id: "cluster-count", type: "symbol", source: "pts",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13,
            "text-font": ["Open Sans Semibold"] },
          paint: { "text-color": CLUSTER[t0].text },
        });
        // Individual points
        map.addLayer({
          id: "halo", type: "circle", source: "pts",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "story"], 1]],
          paint: {
            "circle-radius": 12,
            "circle-color": ["match", ["get", "status"], "coming_soon", COLORS.coming_soon, COLORS.open],
            "circle-opacity": 0.16,
          },
        });
        map.addLayer({
          id: "dots", type: "circle", source: "pts",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["case", ["==", ["get", "story"], 1], 6, 4],
            "circle-color": ["match", ["get", "status"], "coming_soon", COLORS.coming_soon, COLORS.open],
            "circle-stroke-width": 1.4,
            "circle-stroke-color": "#0d1117",
          },
        });
        map.on("click", "clusters", (e: any) => {
          const f: any = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const id = f.properties.cluster_id;
          (map.getSource("pts") as any).getClusterExpansionZoom(id, (err: any, zoom: number) => {
            if (err) return;
            map.easeTo({ center: f.geometry.coordinates, zoom });
          });
        });
        map.on("click", "dots", (e: any) => showPopup(e.features[0].properties.id));
        for (const layer of ["clusters", "dots"]) {
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        }
      });
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && map.getSource && map.getSource("pts")) map.getSource("pts").setData(geo);
  }, [geo]);

  function showPopup(id: string) {
    const p = byId[id];
    if (!p || p.lat == null) return;
    const map = mapRef.current;
    const maplibregl = glRef.current;
    if (!map || !maplibregl) return;
    if (popupRef.current) popupRef.current.remove();
    const e = p.enrichment || {};
    popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: "260px" })
      .setLngLat([p.lng, p.lat])
      .setHTML(
        `<div class="pn">${esc(nameOf(p))}</div>` +
          `<div class="ph">${esc(p.neighborhood || "")} · ${statusLabel(p.status)}</div>` +
          (e.hook || e.description ? `<div class="pd">${esc(e.hook || e.description)}</div>` : "") +
          `<a class="pl" href="/openings/${p.slug}">View details →</a>`
      )
      .addTo(map);
  }

  function toggleView() {
    const next = view === "list" ? "map" : "list";
    setView(next);
    if (next === "map") setTimeout(() => mapRef.current && mapRef.current.resize(), 60);
  }

  const rows = useMemo(() => {
    return visible.slice().sort((a, b) => {
      const sa = (hasStory(a) ? 2 : 0) + (a.status !== "coming_soon" ? 1 : 0);
      const sb = (hasStory(b) ? 2 : 0) + (b.status !== "coming_soon" ? 1 : 0);
      if (sa !== sb) return sb - sa;
      return (b.permit_start || "").localeCompare(a.permit_start || "");
    });
  }, [visible]);

  const chips: [string, string][] = [
    ["all", "All"],
    ["open", "Open"],
    ["coming_soon", "Coming soon"],
    ["saved", savedCount ? `Saved · ${savedCount}` : "Saved"],
  ];

  return (
    <div className={`app view-${view}`}>
      <div className="panel">
        <header>
          <div className="titlerow">
            <h1>New in <span className="g">SF</span></h1>
            <div className="titleright">
              <button className="themebtn" onClick={toggleTheme}
                      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                {theme === "dark" ? "☀" : "☾"}
              </button>
              <Link href="/updates" className="updatesLink">Updates →</Link>
            </div>
          </div>
          <p className="sub">Cafes &amp; retail opening across the city — from permit filings, confirmed live.</p>
          <div className="stats">
            <div className="stat"><div className="n">{stats.total}</div><div className="l">tracked</div></div>
            <div className="stat"><div className="n open">{stats.open}</div><div className="l">open</div></div>
            <div className="stat"><div className="n soon">{stats.soon}</div><div className="l">coming soon</div></div>
          </div>
        </header>
        <div className="controls">
          <input className="search" type="search" placeholder="Search name or neighborhood…"
                 value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="hoodsel" value={hood} onChange={(e) => setHood(e.target.value)}>
            <option value="all">All neighborhoods</option>
            {neighborhoods.map(([name, n]) => (
              <option key={name} value={name}>{name} ({n})</option>
            ))}
          </select>
          <div className="filters">
            {chips.map(([s, label]) => (
              <button key={s} className={"chip" + (filter === s ? " active" : "")} data-s={s}
                   onClick={() => setFilter(s)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="list">
          {rows.length === 0 && (
            <div className="empty">
              {filter === "saved" && savedCount === 0
                ? "Tap the heart on any place to save it here."
                : "No places match."}
            </div>
          )}
          {rows.map((p) => {
            const line = lineOf(p);
            const saved = isSaved(p.uniqueid);
            return (
              <Link key={p.uniqueid} className="card" href={`/openings/${p.slug}`}>
                <div className="top">
                  <div className="cardmain">
                    <div className="name">{nameOf(p)}</div>
                    <div className="hood">{p.neighborhood || "San Francisco"}</div>
                  </div>
                  <div className="cardright">
                    <span className={"badge " + statusClass(p.status)}>{statusLabel(p.status)}</span>
                    <button
                      className={"savebtn" + (saved ? " on" : "")}
                      aria-label={saved ? "Remove from saved" : "Save"}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(p.uniqueid); }}
                    >{saved ? "♥" : "♡"}</button>
                  </div>
                </div>
                {line && <div className="hook">{line}</div>}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="mapwrap" ref={mapEl} />
      <button className="viewtoggle" onClick={toggleView}>{view === "list" ? "Map" : "List"}</button>
    </div>
  );
}

function esc(s: any) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m] as string)
  );
}
