"use client";

import { useEffect, useRef, useState } from "react";

type Cand = { name: string; lat: number; lng: number; source: "exact" | "nearby"; address?: string };

function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

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

  const search = async (query: string) => {
    const s = query.trim();
    if (!s) {
      setItems([]);
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(s)}`, { cache: "no-store" });
    const js = await res.json();
    const arr: Cand[] = js.items || [];
    setItems(arr);
    setOpen(true);

    // 近傍候補のみの場合は地図にも候補群を描画させる
    if (arr.length > 0 && arr.every((i) => i.source === "nearby")) {
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: arr } }));
    } else {
      // 完全一致や単一選択時は候補レイヤーを消す用の空通知でもOK
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
    }
  };

  const debounced = useRef(debounce(search, 250)).current;

  const select = (c: Cand) => {
    setQ(c.name);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17 } }));
  };

  const hasExact = items.some((i) => i.source === "exact");

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 620, zIndex: 10001 }}>
      <input
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          debounced(v);
        }}
        onFocus={() => q && items.length && setOpen(true)}
        placeholder="例）川岸三丁目 戸田市（完全一致優先／一致なしは候補表示）"
        style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, background: "#fff" }}
      />
      {open && items.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 10000,           // ← 地図より前面に
            top: "110%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          {hasExact && (
            <div style={{ padding: "6px 10px", fontSize: 12, color: "#0a7", background: "#f6fffa" }}>完全一致</div>
          )}
          {items.map((c, idx) => (
            <button
              key={`${c.lat},${c.lng},${idx}`}
              type="button"
              onClick={() => select(c)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                background: c.source === "exact" ? "#f8fffb" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.name || "交差点候補"}</div>
              {c.source === "nearby" && <div style={{ fontSize: 12, color: "#666" }}>（近辺の候補）</div>}
            </button>
          ))}
          {!hasExact && (
            <div style={{ padding: "6px 10px", fontSize: 12, color: "#888" }}>
              完全一致が見つからなかったため、近辺の交差点候補を表示しています
            </div>
          )}
        </div>
      )}
    </div>
  );
}
