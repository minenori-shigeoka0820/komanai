// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { normalizeName, variants } from "../../../lib/normalize";

type Cand = {
  name: string;
  lat: number;
  lng: number;
  source: "exact" | "partial" | "nearby";
  address?: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;

async function sbSelect(path: string) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    cache: "no-store" as any,
  });
  return r.ok ? r.json() : [];
}

async function nominatimCenter(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
    q
  )}&countrycodes=jp&limit=1&accept-language=ja&addressdetails=1`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "komanai.com search" } as any,
      cache: "no-store" as any,
    });
    const js = await r.json();
    if (Array.isArray(js) && js[0]?.lat && js[0]?.lon) {
      return { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
    }
  } catch {}
  return null;
}

function dedupByCoord(items: Cand[], digits = 6) {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.name}|${it.lat.toFixed(digits)}|${it.lng.toFixed(digits)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const HWY_ROAD_REGEX =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$";
const NOT_BUS =
  `["highway"!="bus_stop"]["amenity"!="bus_station"]["public_transport"!="platform"]["public_transport"!="stop_position"]["public_transport"!="stop_area"]`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  if (!raw) return NextResponse.json({ items: [] });

  // cityヒント（「…市/区/町/村」で終わる最長一致をざっくり拾う）
  const m = raw.match(/(.+[市区町村])/);
  const cityHint = m ? m[1] : "";

  // まずは Supabase キャッシュから
  const norm = normalizeName(raw);
  const vlist = variants(raw).map((v) => v.toLowerCase());
  const whereCity = cityHint ? `&city=eq.${encodeURIComponent(cityHint)}` : "";

  // 完全一致（variants）
  const exact = await sbSelect(
    `intersections?select=name,lat,lng,city&name_norm=in.(${vlist.map(encodeURIComponent).join(",")})${whereCity}`
  );
  if (Array.isArray(exact) && exact.length) {
    return NextResponse.json({
      items: exact.map((r: any) => ({ name: r.name, lat: r.lat, lng: r.lng, source: "exact" as const })),
    });
  }

  // 部分一致（name_norm ILIKE）
  const partial = await sbSelect(
    `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(norm)}*${whereCity}`
  );
  if (Array.isArray(partial) && partial.length) {
    return NextResponse.json({
      items: (partial as any[])
        .slice(0, 20)
        .map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, source: "partial" as const })),
    });
  }

  // キャッシュ薄い → 非同期で市単位インデックス作成をキックしつつ、いまは空を返す
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const cityToIndex = cityHint || raw; // とりあえず生入力でもOK
  if (SERVICE_KEY) {
    fetch(`${baseUrl}/api/index-area?city=${encodeURIComponent(cityToIndex)}`).catch(() => {});
  }

  // 最初は空、数秒後に再検索でヒット（キャッシュ作成後）
  return NextResponse.json({ items: [] });
}
