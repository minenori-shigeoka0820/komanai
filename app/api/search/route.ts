// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { normalizeName, kanjiNumToArabic, variants } from "../../../lib/normalize";

type Cand = {
  name: string;
  lat: number;
  lng: number;
  source: "exact" | "partial" | "live";
  city?: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;

// ----- Supabase -----
async function sbSelect(path: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    cache: "no-store" as any,
  });
  return r.ok ? r.json() : [];
}
async function sbUpsert(rows: any[]) {
  if (!SUPABASE_URL || !SERVICE_KEY || !rows?.length) return;
  await fetch(`${SUPABASE_URL}/rest/v1/intersections`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  }).catch(() => {});
}

// ----- Helpers -----
function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}
function pickCityHint(input: string) {
  const tokens = input.split(/[\s　]+/).filter(Boolean);
  const cands = tokens.filter((t) => /[市区町村]$/.test(t));
  return cands.length ? cands[cands.length - 1] : "";
}
function stripCity(input: string) {
  const c = pickCityHint(input);
  return c ? input.replace(new RegExp(`[\\s　]*${c}$`), "") : input;
}
async function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    // @ts-ignore
    return await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  } finally {
    clearTimeout(t);
  }
}

// ----- Overpass -----
const HWY_ROAD_REGEX =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$";
const NOT_BUS =
  `["highway"!="bus_stop"]["amenity"!="bus_station"]["public_transport"!="platform"]["public_transport"!="stop_position"]["public_transport"!="stop_area"]`;

// 近傍 完全一致（中心がある時だけ）
async function overpassExactNear(center: { lat: number; lng: number }, vlist: string[], radius = 6000) {
  const alt = vlist.map((v) => `^${v}$`).join("|");
  const q = `
    [out:json][timeout:25];
    (
      node(around:${radius},${center.lat},${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"~"${alt}",i]${NOT_BUS};
      node(around:${radius},${center.lat},${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${alt}",i]${NOT_BUS};
      node(around:${radius},${center.lat},${center.lng})["junction"]["name"~"${alt}",i]${NOT_BUS};
      way(around:${radius},${center.lat},${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"~"${alt}",i]${NOT_BUS};
      way(around:${radius},${center.lat},${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${alt}",i]${NOT_BUS};
      way(around:${radius},${center.lat},${center.lng})["junction"]["name"~"${alt}",i]${NOT_BUS};
    );
    out tags center 200;
  `;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: q,
  });
  const js = await r.json();
  return (js?.elements ?? [])
    .map((e: any) => {
      const lat = e.lat ?? e.center?.lat,
        lng = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      return lat && lng && name ? { name, lat, lng } : null;
    })
    .filter(Boolean) as { name: string; lat: number; lng: number }[];
}

// 全国 完全一致（曖昧センタリングはしない）
async function overpassExactNationwide(vlist: string[]) {
  const alt = vlist.map((v) => `^${v}$`).join("|");
  const q = `
    [out:json][timeout:25];
    (
      node["name"~"${alt}",i];
      way["name"~"${alt}",i];
      relation["name"~"${alt}",i];
      node["name:ja"~"${alt}",i];
      way["name:ja"~"${alt}",i];
      relation["name:ja"~"${alt}",i];
    );
    out tags center 200;
  `;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: q,
  });
  const js = await r.json();
  return (js?.elements ?? [])
    .map((e: any) => {
      const lat = e.lat ?? e.center?.lat,
        lng = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      return lat && lng && name ? { name, lat, lng } : null;
    })
    .filter(Boolean) as { name: string; lat: number; lng: number }[];
}

// 逆ジオで city を付与（最大 n 件）
async function enrichCity(rows: { name: string; lat: number; lng: number }[], n = 8) {
  const out: { name: string; lat: number; lng: number; city?: string | null }[] = [];
  for (const r of rows.slice(0, n)) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${r.lat}&lon=${r.lng}&zoom=16&accept-language=ja&addressdetails=1`;
      const jr = await withTimeout(fetch(url, { headers: { "User-Agent": "komanai search" } as any }), 8000);
      const js = await jr.json();
      const city =
        js?.address?.city ||
        js?.address?.town ||
        js?.address?.village ||
        js?.address?.municipality ||
        js?.address?.county ||
        null;
      out.push({ ...r, city });
    } catch {
      out.push({ ...r, city: null });
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const view = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  if (!raw) return NextResponse.json({ items: [] });

  const cityHint = pickCityHint(raw);     // 並べ替え用
  const bare = stripCity(raw);
  const base = normalizeName(bare);
  const vlist = variants(bare).map((v) => v.toLowerCase());

  // 1) Supabase 完全一致 → 部分一致
  const orExact = `or=(${vlist.map((v) => `name_norm.ilike.${encodeURIComponent(v)}`).join(",")})`;
  let exact: any[] = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
  if (exact?.length) {
    let items: Cand[] = exact.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "exact" as const }));
    if (view) items.sort((a, b) => dist(a, view) - dist(b, view));
    else items.sort((a, b) => ((a.city === cityHint ? 0 : 1) - (b.city === cityHint ? 0 : 1)));
    return NextResponse.json({ items });
  }

  let partial: any[] = await sbSelect(
    `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(base)}*`
  );
  if (partial?.length) {
    const seen = new Set<string>();
    let items: Cand[] = (partial as any[])
      .map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "partial" as const }))
      .filter((r) => {
        const k = `${r.name}|${r.lat.toFixed(6)}|${r.lng.toFixed(6)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 20);
    if (view) items.sort((a, b) => dist(a, view) - dist(b, view));
    else items.sort((a, b) => ((a.city === cityHint ? 0 : 1) - (b.city === cityHint ? 0 : 1)));
    return NextResponse.json({ items });
  }

  // 2) Overpass ライブ：近傍 完全一致（※ビューがあるときだけ）
  if (view) {
    const liveNear = await withTimeout(overpassExactNear(view, vlist, 6000), 12000).catch(() => []);
    if (liveNear.length) {
      const enriched = await enrichCity(liveNear, 8);
      const items = enriched.map((r) => ({ ...r, source: "live" as const }));
      // キャッシュ
      sbUpsert(items.map((r) => ({ name: r.name, name_norm: normalizeName(r.name), lat: r.lat, lng: r.lng, city: r.city || null })));
      // 近い順
      items.sort((a, b) => dist(a, view) - dist(b, view));
      return NextResponse.json({ items });
    }
  }

  // 3) Overpass ライブ：全国 完全一致（node/way/relation, name/name:ja）
  const liveAll = await withTimeout(overpassExactNationwide(vlist), 12000).catch(() => []);
  if (liveAll.length) {
    const enriched = await enrichCity(liveAll, 8);
    // city が cityHint に一致するものを優先 → それ以外
    enriched.sort((a, b) => {
      const aw = a.city === cityHint ? 0 : 1;
      const bw = b.city === cityHint ? 0 : 1;
      if (aw !== bw) return aw - bw;
      if (view) return dist(a, view) - dist(b, view);
      return 0;
    });
    const items = enriched.map((r) => ({ ...r, source: "live" as const })).slice(0, 20);
    sbUpsert(items.map((r) => ({ name: r.name, name_norm: normalizeName(r.name), lat: r.lat, lng: r.lng, city: r.city || null })));
    return NextResponse.json({ items });
  }

  // ヒットなし
  return NextResponse.json({ items: [] });
}
