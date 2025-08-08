import { normalizeName, variants } from "../../../lib/normalize";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;

async function nominatimCenter(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=jp&limit=1&accept-language=ja&addressdetails=1`;
  const r = await fetch(url, { headers: { "User-Agent": "komanai.com indexer" } as any, cache: "no-store" as any });
  const js = await r.json();
  if (Array.isArray(js) && js[0]?.lat && js[0]?.lon && js[0]?.display_name) {
    return { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon), display: js[0].display_name };
  }
  return null;
}

const HWY_ROAD_REGEX =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)$";
const NOT_BUS =
  `["highway"!="bus_stop"]["amenity"!="bus_station"]["public_transport"!="platform"]["public_transport"!="stop_position"]["public_transport"!="stop_area"]`;

async function indexCity(city: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: "Server key missing" }, { status: 500 });
  }
  const center = await nominatimCenter(city);
  if (!center) return NextResponse.json({ ok: false, error: "city not found" }, { status: 404 });

  const overpass = `
    [out:json][timeout:30];
    (
      node(around:5000, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"]${NOT_BUS};
      way(around:5000, ${center.lat}, ${center.lng})["highway"~"${HWY_ROAD_REGEX}"]["name"]${NOT_BUS};
      node(around:5000, ${center.lat}, ${center.lng})["highway"~"traffic_signals|stop|crossing"]["name"]${NOT_BUS};
      node(around:5000, ${center.lat}, ${center.lng})["junction"]["name"]${NOT_BUS};
      way(around:5000, ${center.lat}, ${center.lng})["junction"]["name"]${NOT_BUS};
    );
    out tags center 2000;
  `;
  const oRes = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: overpass,
    cache: "no-store" as any,
  });
  const oJs = await oRes.json();

  const rows = (oJs?.elements ?? [])
    .map((e: any) => {
      const y = e.lat ?? e.center?.lat;
      const x = e.lon ?? e.center?.lon;
      const name = (e.tags?.["name:ja"] || e.tags?.name || "").trim();
      if (!y || !x || !name) return null;
      return {
        name,
        name_norm: normalizeName(name),
        lat: y,
        lng: x,
        city: city.trim(),
        osm_type: e.type,
        osm_id: e.id,
      };
    })
    .filter(Boolean);

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/intersections`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return NextResponse.json({ ok: false, error: txt }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}

// ★ ここで GET/POST 両対応に
export async function GET(req: NextRequest) {
  const city = new URL(req.url).searchParams.get("city") || "";
  if (!city) return NextResponse.json({ ok: false, error: "city required" }, { status: 400 });
  return indexCity(city);
}

export async function POST(req: NextRequest) {
  const { city } = await req.json().catch(() => ({ city: "" }));
  if (!city) return NextResponse.json({ ok: false, error: "city required" }, { status: 400 });
  return indexCity(city);
}

