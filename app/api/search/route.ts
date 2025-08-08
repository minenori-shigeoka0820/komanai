import { NextRequest, NextResponse } from "next/server";

type Cand = { name: string; lat: number; lng: number; source: "exact" | "nearby"; address?: string };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ items: [] });

  // 例： "川岸三丁目 戸田市" → city 推定
  const tokens = q.split(/\s+/);
  const city = tokens.find(t => /市|区|町|村$/.test(t)) || "";
  const term = q; // 完全一致優先。改良余地：市を除いた本体だけでも試す

  // 1) Overpass完全一致（全国 or city内）
  const areaClause = city
    ? `area["name"="${city}"]["boundary"="administrative"];(.area;)->.a;`
    : `node._dummy; ->.a;`; // ダミー（全国検索に切替）
  const inArea = city ? `(area.a)` : ``;

  const overpassExact = `
    [out:json][timeout:15];
    ${areaClause}
    (
      node${inArea}["highway"~"traffic_signals|stop|crossing"]["name"="${term}"];
      node${inArea}["junction"]["name"="${term}"];
      way${inArea}["junction"]["name"="${term}"];
    );
    out tags center 50;
  `;

  try {
    const oRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: overpassExact,
      cache: "no-store" as any,
    });
    const oData = await oRes.json();
    const exactItems: Cand[] = (oData?.elements ?? [])
      .map((e: any) => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const name = e.tags?.["name:ja"] || e.tags?.name || "";
        return lat && lng && name ? { name, lat, lng, source: "exact" as const } : null;
      })
      .filter(Boolean);

    if (exactItems.length) {
      // 重複を多少まとめる
      const seen = new Set<string>();
      const uniq = exactItems.filter((it) => {
        const key = `${it.name}|${it.lat.toFixed(6)}|${it.lng.toFixed(6)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return NextResponse.json({ items: uniq });
    }
  } catch { /* ignore */ }

  // 2) 一致なし → Nominatimで中心点 → その周辺交差点を複数
  let center: { lat: number; lng: number } | null = null;
  try {
    const nUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=jp&limit=1&accept-language=ja&addressdetails=1`;
    const nRes = await fetch(nUrl, { headers: { "User-Agent": "komanai.com demo" } as any });
    const n = await nRes.json();
    if (Array.isArray(n) && n[0]?.lat && n[0]?.lon) {
      center = { lat: parseFloat(n[0].lat), lng: parseFloat(n[0].lon) };
    }
  } catch { /* ignore */ }

  if (!center) return NextResponse.json({ items: [] });

  // 近傍の交差点ノード列挙（半径200m）
  const overpassNearby = `
    [out:json][timeout:15];
    (
      node(around:200, ${center.lat}, ${center.lng})["highway"~"traffic_signals|stop|crossing"];
      node(around:200, ${center.lat}, ${center.lng})["junction"~"yes|intersection|roundabout"];
    );
    out tags center 80;
  `;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: overpassNearby,
      cache: "no-store" as any,
    });
    const d = await r.json();
    const items: Cand[] = (d?.elements ?? []).map((e: any) => {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      const name = e.tags?.["name:ja"] || e.tags?.name || ""; // ないことも多い
      return { name: name || "交差点候補", lat, lng, source: "nearby" as const };
    });

    // 近い順に上位表示
    items.sort((a, b) =>
      Math.hypot(a.lat - center!.lat, a.lng - center!.lng) - Math.hypot(b.lat - center!.lat, b.lng - center!.lng)
    );
    // 重複除去
    const seen = new Set<string>();
    const uniq = items.filter((it) => {
      const key = `${it.lat.toFixed(6)}|${it.lng.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);

    return NextResponse.json({ items: uniq });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
