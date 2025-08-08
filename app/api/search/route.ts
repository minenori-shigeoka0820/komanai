import { NextRequest, NextResponse } from "next/server";

type Cand = {
  name: string;
  lat: number;
  lng: number;
  source: "exact" | "nearby";
  address?: string;
};

async function nominatimCenter(q: string) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      q
    )}&countrycodes=jp&limit=1&accept-language=ja&addressdetails=1`;
    const r = await fetch(url, {
      headers: { "User-Agent": "komanai.com demo" } as any,
      cache: "no-store" as any,
    });
    const js = await r.json();
    if (Array.isArray(js) && js[0]?.lat && js[0]?.lon) {
      return { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
    }
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ items: [] });

  // クエリから「市/区/町/村」を含むかで中心を推定
  const hasCityToken = /[市区町村]($|\s)/.test(q);
  const center = hasCityToken ? await nominatimCenter(q) : null;

  // 1) 完全一致（name / name:ja）のみを探索（大文字小文字無視）
  //    - 中心が取れていれば around:1500m に限定
  //    - 取れない場合は全国だが、交通関連の要素に絞って最大100件
  const term = q.replace(/\s+/g, ""); // 空白差を吸収
  const eq = `^${term}$`;
  const areaAround = center
    ? `node(around:1500, ${center.lat}, ${center.lng})`
    : "node";
  const wayAround = center
    ? `way(around:1500, ${center.lat}, ${center.lng})`
    : "way";

  const overpassExact = `
    [out:json][timeout:20];
    (
      ${areaAround}["highway"]["name"~"${eq}",i];
      ${areaAround}["highway"]["name:ja"~"${eq}",i];
      ${areaAround}["highway"~"traffic_signals|stop|crossing"]["name"~"${eq}",i];
      ${areaAround}["junction"]["name"~"${eq}",i];

      ${wayAround}["highway"]["name"~"${eq}",i];
      ${wayAround}["highway"]["name:ja"~"${eq}",i];
      ${wayAround}["junction"]["name"~"${eq}",i];
    );
    out tags center 100;
  `;

  try {
    const oRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: overpassExact,
      cache: "no-store" as any,
    });
    const oJs = await oRes.json();
    let exact: Cand[] =
      (oJs?.elements ?? [])
        .map((e: any) => {
          const y = e.lat ?? e.center?.lat;
          const x = e.lon ?? e.center?.lon;
          const raw = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
          if (!y || !x || !raw) return null;
          // スペース無視で完全一致確認
          const norm = raw.replace(/\s+/g, "");
          if (norm.toLowerCase() !== term.toLowerCase()) return null;
          return { name: raw, lat: y, lng: x, source: "exact" as const };
        })
        .filter(Boolean) as Cand[];

    // 重複除去＆近い順
    if (exact.length) {
      const seen = new Set<string>();
      exact = exact.filter((it) => {
        const key = `${it.name}|${it.lat.toFixed(6)}|${it.lng.toFixed(6)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (center) {
        exact.sort(
          (a, b) =>
            Math.hypot(a.lat - center.lat, a.lng - center.lng) -
            Math.hypot(b.lat - center.lat, b.lng - center.lng)
        );
      }
      return NextResponse.json({ items: exact });
    }
  } catch {}

  // 2) 完全一致なし → 近傍候補（中心がなければまず中心を取る）
  const nearCenter = center ?? (await nominatimCenter(q));
  if (!nearCenter) return NextResponse.json({ items: [] });

  const overpassNearby = `
    [out:json][timeout:20];
    (
      node(around:300, ${nearCenter.lat}, ${nearCenter.lng})["highway"~"traffic_signals|stop|crossing"];
      node(around:300, ${nearCenter.lat}, ${nearCenter.lng})["junction"~"yes|intersection|roundabout"];
      way(around:300, ${nearCenter.lat}, ${nearCenter.lng})["junction"]["name"];
    );
    out tags center 120;
  `;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: overpassNearby,
      cache: "no-store" as any,
    });
    const d = await r.json();
    let items: Cand[] =
      (d?.elements ?? []).map((e: any) => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const name = (e.tags?.["name:ja"] || e.tags?.name || "交差点候補").trim();
        return { name, lat, lng, source: "nearby" as const };
      }) || [];
    // 近い順＋重複除去
    items.sort(
      (a, b) =>
        Math.hypot(a.lat - nearCenter.lat, a.lng - nearCenter.lng) -
        Math.hypot(b.lat - nearCenter.lat, b.lng - nearCenter.lng)
    );
    const seen = new Set<string>();
    items = items.filter((it) => {
      const key = `${it.lat.toFixed(6)}|${it.lng.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
