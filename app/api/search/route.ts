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

// Supabase RESTでSELECT（サービスキーでサーバーからのみ呼ぶ）
async function sbSelect(path: string) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    cache: "no-store" as any,
  });
  if (!r.ok) return [];
  return r.json();
}

// ざっくり「◯◯市/区/町/村」で終わる最長一致を拾う
function pickCityHint(input: string) {
  const m = input.match(/(.+[市区町村])/);
  return m ? m[1].trim() : "";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  if (!raw) return NextResponse.json({ items: [] });

  // 正規化
  const norm = normalizeName(raw);            // 空白除去＋漢数字→数字＋末尾「交差点」除去
  const vlist = variants(raw);                // [基底形, 基底形+交差点]
  const cityHint = pickCityHint(raw);         // 例：「戸田市」

  // city指定（あるなら絞る）
  const cityParam = cityHint ? `&city=eq.${encodeURIComponent(cityHint)}` : "";

  // 1) 完全一致（name_norm = ilike でケース無視の“実質等価”）
  //    or=(name_norm.ilike.foo,name_norm.ilike.bar)
  const orExact = `or=(${vlist
    .map((v) => `name_norm.ilike.${encodeURIComponent(v)}`)
    .join(",")})`;

  let exact: any[] = await sbSelect(
    `intersections?select=name,lat,lng,city&${orExact}${cityParam}`
  );

  // cityヒントが無くて0件なら、全国からもう一度
  if ((!exact || exact.length === 0) && !cityHint) {
    exact = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
  }

  if (exact && exact.length) {
    const items: Cand[] = exact.map((r: any) => ({
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      city: r.city,
      source: "exact",
    }));
    return NextResponse.json({ items });
  }

  // 2) 部分一致（name_norm ILIKE %norm%）
  let partial: any[] = await sbSelect(
    `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(
      norm
    )}*${cityParam}`
  );

  // cityヒントが無くて0件なら、全国からもう一度
  if ((!partial || partial.length === 0) && !cityHint) {
    partial = await sbSelect(
      `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(
        norm
      )}*`
    );
  }

  if (partial && partial.length) {
    // 重複をざっくり除去しつつ20件に圧縮
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

  // 3) ここまで0件なら、バックグラウンドで市単位インデックスを作らせる（次回から速くなる）
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const cityToIndex = cityHint || raw; // 入力そのものでもOK
  if (SERVICE_KEY && baseUrl) {
    fetch(`${baseUrl}/api/index-area?city=${encodeURIComponent(cityToIndex)}`).catch(() => {});
  }

  // ひとまず空を返す（インデックス完了後に再検索で出る）
  return NextResponse.json({ items: [] });
}
