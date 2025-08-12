// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { normalizeName, variants } from "../../../lib/normalize";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE!;

async function sbSelect(path: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    cache: "no-store" as any,
  });
  return r.ok ? r.json() : [];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") || "").trim();
  if (!raw) return NextResponse.json({ items: [] });

  const vlist = variants(raw).map((v) => v.toLowerCase());
  const orExact = `or=(${vlist.map((v) => `name_norm.ilike.${encodeURIComponent(v)}`).join(",")})`;

  // Supabase完全一致
  let exact: any[] = await sbSelect(`intersections?select=name,lat,lng,city&${orExact}`);
  if (exact?.length) {
    return NextResponse.json({
      items: exact.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "exact" })),
    });
  }

  // Supabase部分一致
  let partial: any[] = await sbSelect(
    `intersections?select=name,lat,lng,city&name_norm=ilike.*${encodeURIComponent(normalizeName(raw))}*`
  );
  if (partial?.length) {
    return NextResponse.json({
      items: partial.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, city: r.city, source: "partial" })),
    });
  }

  // ヒットなし
  return NextResponse.json({ items: [] });
}
