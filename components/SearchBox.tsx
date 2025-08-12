"use client";
import { useEffect, useState } from "react";

type Cand = { name: string; lat: number; lng: number; city?: string; source: "exact" | "partial" | "live" };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Cand[]>([]);
  const [open, setOpen] = useState(false);

  // 投稿ドラフト
  const [draftName, setDraftName] = useState("");
  const [draftAddr, setDraftAddr] = useState("");
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 地図クリック（pick）で住所と座標を取り込む
  useEffect(() => {
    const onPick = (ev: any) => {
      const { lat, lng, address } = ev.detail || {};
      if (typeof lat === "number" && typeof lng === "number") {
        setDraftLat(lat);
        setDraftLng(lng);
        if (!draftAddr) setDraftAddr(address || "");
      }
    };
    window.addEventListener("komanai:picked", onPick);
    return () => window.removeEventListener("komanai:picked", onPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftAddr]);

  async function runSearch() {
    setMsg(null);
    const s = q.trim();
    if (!s) {
      setItems([]);
      setOpen(false);
      return;
    }
    // 現在地（地図中心）をAPIへ
    // @ts-ignore
    const view = (window.__komanai_view as { lat: number; lng: number }) || null;
    const url = new URL(`/api/search`, window.location.origin);
    url.searchParams.set("q", s);
    if (view) {
      url.searchParams.set("lat", String(view.lat));
      url.searchParams.set("lng", String(view.lng));
    }

    const res = await fetch(url.toString(), { cache: "no-store" });
    const js = await res.json();
    const arr: Cand[] = js.items || [];

    // ✅ 修正：わかりやすくランク表を使う
    const rank = { exact: 0, live: 1, partial: 2 } as const;
    arr.sort((a, b) => rank[a.source] - rank[b.source]);

    setItems(arr);
    setOpen(true);

    // 候補マーカーの描画/クリア
    if (arr.length > 0 && arr.every((i) => i.source !== "exact")) {
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: arr } }));
    } else {
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
    }
  }

  function flyTo(c: Cand) {
    setQ(c.name);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17, name: c.name } }));
  }

  function resetAll() {
    setQ("");
    setItems([]);
    setOpen(false);
    setDraftName("");
    setDraftAddr("");
    setDraftLat(null);
    setDraftLng(null);
    setMsg(null);
    window.dispatchEvent(new Event("komanai:reset"));
    window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
  }

  async function submitDraft() {
    if (!draftName || draftLat == null || draftLng == null) {
      setMsg("交差点名と、地図上での地点の指定が必要です。");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/user-intersections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          address: draftAddr.trim(),
          lat: draftLat,
          lng: draftLng,
        }),
      });
      const js = await r.json().catch(() => ({}));
      if (!r.ok || js?.ok === false) {
        setMsg(`保存に失敗しました: ${js?.error || r.statusText}`);
      } else {
        setMsg("保存しました。ご協力ありがとうございます！");
        setDraftName("");
        // 住所と座標は残す：連続投稿しやすくするため
      }
    } catch (e: any) {
      setMsg(`保存に失敗しました: ${e?.message || "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "relative", maxWidth: 760, zIndex: 10001, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 入力＆ボタン */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="例）渋谷駅前交差点 / 大六天 所沢市 / 藤沢 入間市"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, background: "#fff" }}
        />
        <button onClick={runSearch} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #0a7", background: "#0a7", color: "#fff" }}>
          検索
        </button>
        <button onClick={resetAll} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #999", background: "#fff" }}>
          リセット
        </button>
      </div>

      {/* 候補リスト */}
      {open && items.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 22px rgba(0,0,0,0.12)" }}>
          {items.map((c, idx) => (
            <button
              key={`${c.lat},${c.lng},${idx}`}
              type="button"
              onClick={() => flyTo(c)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", border: "none",
                background: c.source === "exact" ? "#f8fffb" : c.source === "live" ? "#f7fbff" : "#fff",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {c.name}
                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
                  {c.city ? ` / ${c.city}` : ""}
                  {c.source === "exact" ? "（キャッシュ）" : c.source === "live" ? "（ライブ）" : "（部分一致）"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 該当なし → 投稿フォーム */}
      {open && items.length === 0 && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff" }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>該当が見つかりませんでした。</div>
          <ol style={{ margin: "0 0 8px 18px", padding: 0 }}>
            <li>地図上で交差点をクリックして位置を指定してください（ピンが立ちます）。</li>
            <li>交差点名と住所を確認・入力して「投稿する」を押してください。</li>
          </ol>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center" }}>
            <div>交差点名 *</div>
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="例）渋谷駅前交差点" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
            <div>交差点住所</div>
            <input value={draftAddr} onChange={(e) => setDraftAddr(e.target.value)} placeholder="地図クリックで自動入力されます" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
            <div>選択座標 *</div>
            <div style={{ color: draftLat != null ? "#333" : "#c00" }}>
              {draftLat != null && draftLng != null ? `${draftLat.toFixed(6)}, ${draftLng.toFixed(6)}` : "地図をクリックしてください"}
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button
              onClick={submitDraft}
              disabled={saving}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #0a7", background: "#0a7", color: "#fff", cursor: "pointer" }}
            >
              {saving ? "保存中…" : "投稿する"}
            </button>
            {msg && <div style={{ alignSelf: "center", color: /失敗/.test(msg) ? "#c00" : "#0a7" }}>{msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
