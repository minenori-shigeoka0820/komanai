import { NextRequest, NextResponse } from "next/server";
import { normalizeName, kanjiNumToArabic, variants } from "../../../lib/normalize";

type Cand = { name: string; lat: number; lng: number; source: "exact" | "partial" | "live"; city?: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE!;

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
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  }).catch(()=>{});
}

function pickCityHint(input: string) {
  const tokens = input.split(/[\s　]+/).filter(Boolean);
  const cand = tokens.filter(t => /[市区町村]$/.test(t));
  return cand.length ? cand[cand.length - 1] : "";
}
function stripCity(input: string) {
  const c = pickCityHint(input);
  return c ? input.replace(new RegExp(`[\\s　]*${c}$`), "") : input;
}
function dist(a:{lat:number,lng:number}, b:{lat:number,lng:number}) {
  return Math.hypot(a.lat-b.lat, a.lng-b.lng);
}

async function nominatimCenter(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=jp&limit=1&accept-language=ja&addressdetails=1`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "komanai search" } as any, cache: "no-store" as any });
    const js = await r.json();
    if (Array.isArray(js) && js[0]?.lat && js[0]?.lon) {
      return { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
    }
  } catch {}
  return null;
}

const HWY_ROAD_REGEX =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$";
const NOT_BUS =
  `["highway"!="bus_stop"]["amenity"!="bus_station"]["public_transport"!="platform"]["public_transport"!="stop_position"]["public_transport"!="stop_area"]`;

async function overpassExact(center: {lat:number,lng:number}|null, vlist: string[], radius = 6000) {
  const aroundNode = center ? (r:number)=>`node(around:${r},${center.lat},${center.lng})` : (_:number)=>`node`;
  const aroundWay  = center ? (r:number)=>`way(around:${r},${center.lat},${center.lng})`  : (_:number)=>`way`;
  const alt = vlist.map(v => `^${v}$`).join("|");
  const q = `
    [out:json][timeout:25];
    (
      ${aroundNode(radius)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundNode(radius)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${alt}",i]${NOT_BUS};
      ${aroundNode(radius)}["highway"~"traffic_signals|stop|crossing"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundNode(radius)}["junction"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundWay(radius)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundWay(radius)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${alt}",i]${NOT_BUS};
      ${aroundWay(radius)}["junction"]["name"~"${alt}",i]${NOT_BUS};
    );
    out tags center 200;
  `;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method:"POST", headers:{ "Content-Type":"text/plain" }, body:q });
  const js = await r.json();
  return (js?.elements??[])
    .map((e:any)=>{
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      return lat && lng && name ? { name, lat, lng } : null;
    }).filter(Boolean) as {name:string,lat:number,lng:number}[];
}
async function overpassPartial(center: {lat:number,lng:number}|null, needle: string, radius = 4000) {
  if (!center) return [];
  const q = `
    [out:json][timeout:25];
    (
      node(around:${radius}, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"~"${needle}",i]${NOT_BUS};
      node(around:${radius}, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${needle}",i]${NOT_BUS};
      node(around:${radius}, ${center.lat}, ${center.lng})["highway"~"traffic_signals|stop|crossing"]["name"~"${needle}",i]${NOT_BUS};
      node(around:${radius}, ${center.lat}, ${center.lng})["junction"]["name"~"${needle}",i]${NOT_BUS};
      way(around:${radius}, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"~"${needle}",i]${NOT_BUS};
      way(around:${radius}, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${needle}",i]${NOT_BUS};
      way(around:${radius}, ${center.lat}, ${center.lng})["junction"]["name"~"${needle}",i]${NOT_BUS};
    );
    out tags center 200;
  `;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method:"POST", headers:{ "Content-Type":"text/plain" }, body:q });
  const js = await r.json();
  return (js?.elements??[])
    .map((e:any)=>{
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      return lat && lng && name ? { name, lat, lng } : null;
    }).filter(Boolean) as {name:string,lat:number,lng:number}[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const view = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  if (!raw) return NextResponse.json({ items: [] });

  const cityHint = (raw.split(/[\s　]+/).filter(Boolean).filter(t=>/[市区町村]$/.test(t)).pop()) || "";
  const bare = cityHint ? raw.replace(new RegExp(`[\\s　]*${cityHint}$`), "") : raw;
  const base = normalizeName(bare);
  const vlist = variants(bare).map(v => v.toLowerCase());

  // 1) キャッシュ（全国）— 完全一致 → 部分一致
  const orExact = `or=(${vlist.map(v => `name_norm.ilike.${encodeURIComponent(v)}`).join(",")})`;
  let exact: any[] = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
  if (exact?.length) {
    let items: Cand[] = exact.map(r => ({ name:r.name, lat:r.lat, lng:r.lng, city:r.city, source:"exact" as const }));
    if (view) items.sort((a,b)=>dist(a,view)-dist(b,view)); // ★ 近い順
    else items.sort((a,b)=>((a.city===cityHint?0:1)-(b.city===cityHint?0:1)));
    return NextResponse.json({ items });
  }

  let partial: any[] = await sbSelect(`intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(base)}*`);
  if (partial?.length) {
    const seen = new Set<string>();
    let items: Cand[] = (partial as any[])
      .map(r => ({ name:r.name, lat:r.lat, lng:r.lng, city:r.city, source:"partial" as const }))
      .filter(r=>{ const k = `${r.name}|${r.lat.toFixed(6)}|${r.lng.toFixed(6)}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0,20);
    if (view) items.sort((a,b)=>dist(a,view)-dist(b,view));
    else items.sort((a,b)=>((a.city===cityHint?0:1)-(b.city===cityHint?0:1)));
    return NextResponse.json({ items });
  }

  // 2) ライブ検索：近傍完全一致 → 全国完全一致 → 近傍部分一致
  const center = view || (await nominatimCenter(cityHint)) || (await nominatimCenter(bare)) || (await nominatimCenter(raw));
  const liveExactNear = await overpassExact(center || null, vlist, 6000);
  if (liveExactNear.length) {
    sbUpsert(liveExactNear.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city: cityHint || null })));
    let items = liveExactNear.map(r=>({ ...r, source:"live" as const }));
    if (view) items.sort((a,b)=>dist(a,view)-dist(b,view));
    return NextResponse.json({ items });
  }
  const liveExactAll = await overpassExact(null, vlist, 0);
  if (liveExactAll.length) {
    sbUpsert(liveExactAll.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city: cityHint || null })));
    let items = liveExactAll.map(r=>({ ...r, source:"live" as const }));
    if (view) items.sort((a,b)=>dist(a,view)-dist(b,view));
    return NextResponse.json({ items });
  }
  const needle = kanjiNumToArabic(base);
  const livePartial = await overpassPartial(center || null, needle, 4000);
  if (livePartial.length) {
    sbUpsert(livePartial.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city: cityHint || null })));
    let items = livePartial.map(r=>({ ...r, source:"live" as const })).slice(0,20);
    if (view) items.sort((a,b)=>dist(a,view)-dist(b,view));
    return NextResponse.json({ items });
  }

  return NextResponse.json({ items: [] });
}
