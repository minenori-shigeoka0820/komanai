// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { normalizeName, kanjiNumToArabic, variants } from "../../../lib/normalize";

type Cand = { name: string; lat: number; lng: number; source: "exact" | "partial" | "live"; city?: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE!;

// --- Supabase SELECT/UPSERT（サーバー専用キーで実行） ---
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

// --- 住所中心点（Nominatim） ---
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

// --- ライブ検索（Overpass） ---
const HWY_ROAD_REGEX =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$";
const NOT_BUS =
  `["highway"!="bus_stop"]["amenity"!="bus_station"]["public_transport"!="platform"]["public_transport"!="stop_position"]["public_transport"!="stop_area"]`;

async function overpassLiveExact(center: {lat:number,lng:number}|null, vlist: string[]) {
  // 中心があれば半径4km内、無ければ全国
  const aroundNode = center ? (r:number)=>`node(around:${r},${center.lat},${center.lng})` : (_:number)=>`node`;
  const aroundWay  = center ? (r:number)=>`way(around:${r},${center.lat},${center.lng})`  : (_:number)=>`way`;
  const alt = vlist.map(v => `^${v}$`).join("|");
  const q = `
    [out:json][timeout:25];
    (
      ${aroundNode(4000)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundNode(4000)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${alt}",i]${NOT_BUS};
      ${aroundNode(4000)}["highway"~"traffic_signals|stop|crossing"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundNode(4000)}["junction"]["name"~"${alt}",i]${NOT_BUS};

      ${aroundWay(4000)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${alt}",i]${NOT_BUS};
      ${aroundWay(4000)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${alt}",i]${NOT_BUS};
      ${aroundWay(4000)}["junction"]["name"~"${alt}",i]${NOT_BUS};
    );
    out tags center 200;
  `;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method:"POST", headers:{ "Content-Type":"text/plain" }, body:q, cache:"no-store" as any
  });
  const js = await r.json();
  return (js?.elements??[])
    .map((e:any)=>{
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      return lat && lng && name ? { name, lat, lng } : null;
    })
    .filter(Boolean) as {name:string,lat:number,lng:number}[];
}

async function overpassLivePartial(center: {lat:number,lng:number}|null, needle: string) {
  if (!center) return [];
  const q = `
    [out:json][timeout:25];
    (
      node(around:3000, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"~"${needle}",i]${NOT_BUS};
      node(around:3000, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${needle}",i]${NOT_BUS};
      node(around:3000, ${center.lat}, ${center.lng})["highway"~"traffic_signals|stop|crossing"]["name"~"${needle}",i]${NOT_BUS};
      node(around:3000, ${center.lat}, ${center.lng})["junction"]["name"~"${needle}",i]${NOT_BUS};
      way(around:3000, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"~"${needle}",i]${NOT_BUS};
      way(around:3000, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${needle}",i]${NOT_BUS};
      way(around:3000, ${center.lat}, ${center.lng})["junction"]["name"~"${needle}",i]${NOT_BUS};
    );
    out tags center 200;
  `;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method:"POST", headers:{ "Content-Type":"text/plain" }, body:q, cache:"no-store" as any
  });
  const js = await r.json();
  return (js?.elements??[])
    .map((e:any)=>{
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      return lat && lng && name ? { name, lat, lng } : null;
    })
    .filter(Boolean) as {name:string,lat:number,lng:number}[];
}

// --- 入力末尾が 市/区/町/村 の単語だけ拾う（重み付け用） ---
function pickCityHint(input: string) {
  const tokens = input.split(/[\s　]+/).filter(Boolean);
  const cand = tokens.filter(t => /[市区町村]$/.test(t));
  return cand.length ? cand[cand.length - 1] : "";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  if (!raw) return NextResponse.json({ items: [] });

  // 正規化＆バリアント
  const base = normalizeName(raw);                // 空白除去 + 漢数字→数字 + 末尾「交差点」除去
  const vlist = variants(raw).map(v => v.toLowerCase());  // [基底, 基底+交差点]
  const cityHint = pickCityHint(raw);

  // 1) まず Supabase キャッシュ（全国から。cityは並べ替えにだけ使う）
  const orExact = `or=(${vlist.map(v => `name_norm.ilike.${encodeURIComponent(v)}`).join(",")})`;
  const exact = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
  if (exact?.length) {
    const items = (exact as any[]).map(r => ({ name:r.name, lat:r.lat, lng:r.lng, city:r.city, source:"exact" as const }));
    // cityが一致していれば上に
    items.sort((a,b)=>{
      const aw = a.city===cityHint ? 0 : 1;
      const bw = b.city===cityHint ? 0 : 1;
      return aw-bw;
    });
    return NextResponse.json({ items });
  }

  const partial = await sbSelect(
    `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(base)}*`
  );
  if (partial?.length) {
    const seen = new Set<string>();
    const items = (partial as any[]).map(r => ({ name:r.name, lat:r.lat, lng:r.lng, city:r.city, source:"partial" as const }))
      .filter(r=>{
        const k = `${r.name}|${r.lat.toFixed(6)}|${r.lng.toFixed(6)}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      }).slice(0,20);
    items.sort((a,b)=>{
      const aw = a.city===cityHint ? 0 : 1;
      const bw = b.city===cityHint ? 0 : 1;
      return aw-bw;
    });
    return NextResponse.json({ items });
  }

  // 2) キャッシュ無ければ ライブ検索（Overpass）
  const center = await nominatimCenter(raw) || await nominatimCenter(`${raw} 日本`);
  const liveExact = await overpassLiveExact(center, vlist);
  if (liveExact.length) {
    // 返しつつ、バックグラウンドでキャッシュ化
    sbUpsert(liveExact.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city:cityHint || null })));
    return NextResponse.json({ items: liveExact.map(r=>({ ...r, source:"live" as const })) });
  }

  const needle = kanjiNumToArabic(base);
  const livePartial = await overpassLivePartial(center, needle);
  if (livePartial.length) {
    sbUpsert(livePartial.map(r=>({ name:r.name, name_norm:normalizeName(r.name), lat:r.lat, lng:r.lng, city:cityHint || null })));
    return NextResponse.json({ items: livePartial.map(r=>({ ...r, source:"live" as const })).slice(0,20) });
  }

  return NextResponse.json({ items: [] });
}
