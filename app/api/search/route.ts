// app/api/search/route.ts
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

// ── ユーティリティ ─────────────────────────────────────────────
function pickCityHint(input: string) {
  const tokens = input.split(/[\s　]+/).filter(Boolean);
  const cand = tokens.filter(t => /[市区町村]$/.test(t));
  return cand.length ? cand[cand.length - 1] : "";
}
function stripCity(input: string) {
  // 最後の「◯◯市/区/町/村」を取り去った残り
  const c = pickCityHint(input);
  return c ? input.replace(new RegExp(`[\\s　]*${c}$`), "") : input;
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

// 近傍 “完全一致”
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

// 近傍 “部分一致”
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
  if (!raw) return NextResponse.json({ items: [] });

  const cityHint = pickCityHint(raw);           // 例: 「所沢市」
  const bare = stripCity(raw);                  // 例: 「大六天」
  const base = normalizeName(bare);             // 空白除去／漢数字→数字／末尾「交差点」外し
  const vlist = variants(bare).map(v => v.toLowerCase());

  // 1) キャッシュ（全国）— 完全一致 → 部分一致
  const orExact = `or=(${vlist.map(v => `name_norm.ilike.${encodeURIComponent(v)}`).join(",")})`;
  const exact = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
  if (exact?.length) {
    const items = (exact as any[]).map(r => ({ name:r.name, lat:r.lat, lng:r.lng, city:r.city, source:"exact" as const }));
    // city一致を上に並べ替え（結果は返す）
    items.sort((a,b)=>((a.city===cityHint?0:1)-(b.city===cityHint?0:1)));
    return NextResponse.json({ items });
  }

  const partial = await sbSelect(`intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(base)}*`);
  if (partial?.length) {
    const seen = new Set<string>();
    const items = (partial as any[])
      .map(r => ({ name:r.name, lat:r.lat, lng:r.lng, city:r.city, source:"partial" as const }))
      .filter(r=>{ const k = `${r.name}|${r.lat.toFixed(6)}|${r.lng.toFixed(6)}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0,20);
    items.sort((a,b)=>((a.city===cityHint?0:1)-(b.city===cityHint?0:1)));
    return NextResponse.json({ items });
  }

  // 2) ライブ検索
  //   2-1) 中心点の候補を増やす： cityHint → bare → raw の順で取得
  const center = (await nominatimCenter(cityHint)) || (await nominatimCenter(bare)) || (await nominatimCenter(raw));
  //   2-2) 近傍 “完全一致” → ダメなら “全国 完全一致” → ダメなら “近傍 部分一致”
  const liveExactNear = await overpassExact(center, vlist, 6000);
  if (liveExactNear.length) {
    sbUpsert(liveExactNear.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city:cityHint || null })));
    return NextResponse.json({ items: liveExactNear.map(r=>({ ...r, source:"live" as const })) });
  }
  const liveExactAll = await overpassExact(null, vlist, 0);
  if (liveExactAll.length) {
    sbUpsert(liveExactAll.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city:cityHint || null })));
    return NextResponse.json({ items: liveExactAll.map(r=>({ ...r, source:"live" as const })) });
  }
  const needle = kanjiNumToArabic(base);
  const livePartial = await overpassPartial(center, needle, 4000);
  if (livePartial.length) {
    sbUpsert(livePartial.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city:cityHint || null })));
    return NextResponse.json({ items: livePartial.map(r=>({ ...r, source:"live" as const })).slice(0,20) });
  }

  return NextResponse.json({ items: [] });
}
