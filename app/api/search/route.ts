import { normalizeName, variants } from "../../../lib/normalize";

type Cand = {
  name: string;
  lat: number;
  lng: number;
  source: "exact" | "partial" | "nearby";
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

function dedupByCoord(items: Cand[], digits = 6) {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.name}|${it.lat.toFixed(digits)}|${it.lng.toFixed(digits)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 実道路のhighwayのみを許可（バス停・歩道等を除外）
const HWY_ROAD_REGEX = "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$";
// バス関連の除外条件
const NOT_BUS = `["highway"!="bus_stop"]["amenity"!="bus_station"]["public_transport"!="platform"]["public_transport"!="stop_position"]`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  if (!raw) return NextResponse.json({ items: [] });

  // 正規化：空白除去＆「交差点」付きを両方見る
  const norm = raw.replace(/\s+/g, "");
  const variants = Array.from(new Set([norm, norm.endsWith("交差点") ? norm : norm + "交差点"]));

  const hasCityToken = /[市区町村]/.test(raw);
  const center = hasCityToken ? await nominatimCenter(raw) : null;

  const nodeAround = center ? (r: number) => `node(around:${r}, ${center.lat}, ${center.lng})` : (_: number) => `node`;
  const wayAround  = center ? (r: number) => `way(around:${r}, ${center.lat}, ${center.lng})`  : (_: number) => `way`;

  // 1) 完全一致（バス停等を除外、実道路＆交差・信号に絞る）
  const regAlternation = variants.map(v => `^${v}$`).join("|");
  const overpassExact = `
    [out:json][timeout:25];
    (
      ${nodeAround(1500)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${regAlternation}",i]${NOT_BUS};
      ${nodeAround(1500)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${regAlternation}",i]${NOT_BUS};
      ${nodeAround(1500)}["highway"~"traffic_signals|stop|crossing"]["name"~"${regAlternation}",i]${NOT_BUS};
      ${nodeAround(1500)}["junction"]["name"~"${regAlternation}",i]${NOT_BUS};

      ${wayAround(1500)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${regAlternation}",i]${NOT_BUS};
      ${wayAround(1500)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${regAlternation}",i]${NOT_BUS};
      ${wayAround(1500)}["junction"]["name"~"${regAlternation}",i]${NOT_BUS};
    );
    out tags center 150;
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
          const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
          if (!y || !x || !name) return null;
          const n = name.replace(/\s+/g, "");
          if (!variants.some(v => n.toLowerCase() === v.toLowerCase())) return null;
          return { name, lat: y, lng: x, source: "exact" as const };
        })
        .filter(Boolean) as Cand[];
    if (exact.length) {
      exact = dedupByCoord(exact);
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

  // 2) 部分一致（こちらもバス停等を除外＋中心付近に限定）
  if (center) {
    const overpassPartial = `
      [out:json][timeout:25];
      (
        ${nodeAround(3000)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${norm}",i]${NOT_BUS};
        ${nodeAround(3000)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${norm}",i]${NOT_BUS};
        ${nodeAround(3000)}["highway"~"traffic_signals|stop|crossing"]["name"~"${norm}",i]${NOT_BUS};
        ${nodeAround(3000)}["junction"]["name"~"${norm}",i]${NOT_BUS};

        ${wayAround(3000)}["highway"~"${HWY_ROAD_REGEX}"]["name"~"${norm}",i]${NOT_BUS};
        ${wayAround(3000)}["highway"~"${HWY_ROAD_REGEX}"]["name:ja"~"${norm}",i]${NOT_BUS};
        ${wayAround(3000)}["junction"]["name"~"${norm}",i]${NOT_BUS};
      );
      out tags center 200;
    `;
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: overpassPartial,
        cache: "no-store" as any,
      });
      const d = await r.json();
      let partial: Cand[] =
        (d?.elements ?? [])
          .map((e: any) => {
            const y = e.lat ?? e.center?.lat;
            const x = e.lon ?? e.center?.lon;
            const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
            return y && x ? { name: name || "交差点（部分一致）", lat: y, lng: x, source: "partial" as const } : null;
          })
          .filter(Boolean) as Cand[];

      if (partial.length) {
        partial = dedupByCoord(partial);
        partial.sort(
          (a, b) =>
            Math.hypot(a.lat - center.lat, a.lng - center.lng) -
            Math.hypot(b.lat - center.lat, b.lng - center.lng)
        );
        return NextResponse.json({ items: partial.slice(0, 20) });
      }
    } catch {}
  }

  // 3) 近傍候補（信号/交差ノードのみ）
  const nearCenter = center ?? (await nominatimCenter(raw));
  if (!nearCenter) return NextResponse.json({ items: [] });

  const overpassNearby = `
    [out:json][timeout:20];
    (
      node(around:400, ${nearCenter.lat}, ${nearCenter.lng})["highway"~"traffic_signals|stop|crossing"]${NOT_BUS};
      node(around:400, ${nearCenter.lat}, ${nearCenter.lng})["junction"~"yes|intersection|roundabout"]${NOT_BUS};
      way(around:400, ${nearCenter.lat}, ${nearCenter.lng})["junction"]["name"]${NOT_BUS};
    );
    out tags center 200;
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
    items = dedupByCoord(items);
    items.sort(
      (a, b) =>
        Math.hypot(a.lat - nearCenter.lat, a.lng - nearCenter.lng) -
        Math.hypot(b.lat - nearCenter.lat, b.lng - nearCenter.lng)
    );
    return NextResponse.json({ items: items.slice(0, 20) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

