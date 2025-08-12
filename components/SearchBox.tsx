"use client";

import { useEffect, useRef, useState } from "react";

type Cand = { name: string; lat: number; lng: number; source: "exact" | "partial" | "live"; city?: string };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Cand[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function runSearch() {
    const s = q.trim();
    if (!s) { setItems([]); setOpen(false); return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(s)}`, { cache: "no-store" });
    const js = await res.json();
    const arr: Cand[] = js.items || [];
    // 表示順：exact → live → partial（同点はそのまま）
    arr.sort((a,b)=>{
      const rank = { exact: 0, live: 1, partial: 2 } as const;
      return rank[a.source] - rank[b.source];
    });
    setItems(arr);
    setOpen(true);

    // 近傍候補だけの場合は地図に候補群を描画（live/partial まとめて）
    if (arr.length > 0 && arr.every(i => i.source !== "exact")) {
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: arr } }));
    } else {
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
    }
  }

  function select(c: Cand) {
    setQ(c.name);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17 } }));
  }

  function resetAll() {
    setQ("");
    setItems([]);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("komanai:reset"));
    window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
  }

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 680, zIndex: 10001 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="例）大六天 所沢市 / 藤沢 入間市（Enter か 検索ボタン）"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, background: "#fff" }}
        />
        <button onClick={runSearch} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #0a7", background: "#0a7", color: "#fff", cursor: "pointer" }}>
          検索
        </button>
        <button onClick={resetAll} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #999", background: "#fff", color: "#333", cursor: "pointer" }}>
          リセット
        </button>
      </div>

      {open && items.length > 0 && (
        <div
          style={{
            position: "absolute", zIndex: 10000, top: "110%", left: 0, right: 0,
            background: "#fff", border: "1px solid #ddd", borderRadius: 8,
            boxShadow: "0 8px 22px rgba(0,0,0,0.12)", overflow: "hidden"
          }}
        >
          {items.map((c, idx) => (
            <button
              key={`${c.lat},${c.lng},${idx}`}
              type="button"
              onClick={() => select(c)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", border: "none",
                background:
                  c.source === "exact" ? "#f8fffb" :
                  c.source === "live"  ? "#f7fbff" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {c.name}
                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
                  {c.source === "exact" ? "（キャッシュ完全一致）" :
                   c.source === "live"  ? "（ライブ一致）" : "（部分一致）"}
                  {c.city ? ` / ${c.city}` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
