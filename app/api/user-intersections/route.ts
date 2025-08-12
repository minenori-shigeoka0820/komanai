import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE!;

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ ok: false, error: "Server key missing" }, { status: 500 });
    }
    const { name, address, lat, lng } = await req.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
    }
    const latN = Number(lat), lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return NextResponse.json({ ok: false, error: "invalid lat/lng" }, { status: 400 });
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_intersections`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ name, address: address || null, lat: latN, lng: lngN }]),
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ ok: false, error: text }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown error" }, { status: 500 });
  }
}

