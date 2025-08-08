// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { normalizeName, variants } from "../../../lib/normalize";

type Cand = {
  name: string;
  lat: number;
  lng: number;
  source: "exact" | "partial";
  city?: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;

async function sbSelect(path: string) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    cache: "no-store" as any,
  });
  if (!r.ok) return [];
  return r.json();
}

// ✅ 「市/区/町/村」で終わる“最後のトークン”だけを返す
function pickCityHint(input: string) {
  const tokens = input.split(/[\s　]+/).filter(Boolean); // 半角/全角スペース両対応
  const candidates = tokens.filter(t => /[市区町村]$/.test(t));
  return candidates.length ? candidates[candidates.length - 1] : "";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  if (!raw) return NextResponse.json({ items: [] });

  const norm = normalizeName(raw);
  const vlist = variants(raw);
  const cityHint = pickCityHint(raw);     // 例: "川岸三丁目 戸田市" → "戸田市" だけ取る

  // city指定（あればまず絞る）
  const cityParam = cityHint ? `&city=eq.${encodeURIComponent(cityHint)}` : "";

  // --- 1) 完全一致 ---
  const orExact = `or=(${vlist
    .map((v) => `name_norm.ilike.${encodeURIComponent(v)}`)
    .join(",")})`;

  // city付き検索
  let exact: any[] = [];
  if (cityHint) {
    exact = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}${cityParam}`);
  }
  // cityで0件 → 全国でも試す（fallback）
  if (!exact || exact.length === 0) {
    const nationwide = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
    if (nationwide && nationwide.length) {
      return NextResponse.json({
        items: nationwide.map((r: any) => ({
          name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "exact" as const,
        })),
      });
    }
  } else {
    // cityでヒットした
    return NextResponse.json({
      items: exact.map((r: any) => ({
        name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "exact" as const,
      })),
    });
  }

  // --- 2) 部分一致 ---
  // city付き
  let partial: any[] = [];
  if (cityHint) {
    partial = await sbSelect(
      `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(norm)}*${cityParam}`
    );
  }
  // cityで0件 → 全国fallback
  if (!partial || partial.length === 0) {
    partial = await sbSelect(
      `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(norm)}*`
    );
  }

  if (partial && partial.length) {
    const seen = new Set<string>();
    const items: Cand[] = [];
    for (const r of partial) {
      const key = `${r.name}|${r.lat.toFixed(6)}|${r.lng.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "partial" });
      if (items.length >= 20) break;
    }
    return NextResponse.json({ items });
  }

  // --- 3) ここまで0件なら、バックグラウンドで市インデックス作成をキック ---
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const cityToIndex = cityHint || raw;
  if (SERVICE_KEY && baseUrl) {
    fetch(`${baseUrl}/api/index-area?city=${encodeURIComponent(cityToIndex)}`).catch(() => {});
  }

  return NextResponse.json({ items: [] });
}
