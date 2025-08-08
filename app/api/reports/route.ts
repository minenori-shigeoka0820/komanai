import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const location_name = String(form.get("location_name") || "");
    const congestion_level = Number(form.get("congestion_level") || 0);
    const cause_text = String(form.get("cause_text") || "");
    const proposal_text = String(form.get("proposal_text") || "");

    if (!location_name || !congestion_level) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }

    // 雛形：locationsが未作成でも動くようダミー保存
    const { data, error } = await supabase
      .from("reports")
      .insert({
        location_id: null,
        user_id: null,
        congestion_level,
        time_band: null,
        body: `${location_name}\n原因:${cause_text}\n提案:${proposal_text}`
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.redirect(new URL("/", req.url));
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
