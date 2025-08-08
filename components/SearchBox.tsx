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
    const trimmed = query.trim();
    if (!trimmed) {
      setItems([]);
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
    const json = await res.json();
    setItems(json.items || []);
    setOpen(true);

    // もし nearby のみ多数返ってきた場合、地図上にも「候補群を描画」させる
    if (Array.isArray(json.items) && json.items.length > 0 && json.items.every((i: Cand) => i.source === "nearby")) {
      window.dispatchEvent(
        new CustomEvent("komanai:candidates", { detail: { items: json.items } })
      );
    }
  };

  const debounced = useRef(debounce(search, 300)).current;

  const select = (c: Cand) => {
    setQ(c.name);
    setOpen(false);
    // 地図へ：選択地点へフライ＆マーカー
    window.dispatchEvent(
      new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17 } })
    );
  };

  const hasExact = items.some((i) => i.source === "exact");

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 600 }}>
      <input
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          debounced(v);
        }}
        onFocus={() => q && items.length && setOpen(true)}
        placeholder="例）川岸三丁目 戸田市（完全一致優先／AND）"
        style={{
          width: "100%", padding: "10px 12px",
          border: "1px solid #ccc", borderRadius: 8,
        }}
      />
      {open && items.length > 0 && (
        <div
          style={{
            position: "absolute", zIndex: 20, top: "110%", left: 0, right: 0,
            background: "#fff", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
            overflow: "hidden"
          }}
        >
          {hasExact && (
            <div style={{ padding: "6px 10px", fontSize: 12, color: "#0a7" }}>完全一致</div>
          )}
          {items.map((c, idx) => (
            <button
              key={`${c.lat},${c.lng},${idx}`}
              type="button"
              onClick={() => select(c)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", border: "none",
                background: c.source === "exact" ? "#f8fffb" : "white",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {c.name}{c.source === "nearby" ? "（候補）" : ""}
              </div>
              {c.address && <div style={{ fontSize: 12, color: "#555" }}>{c.address}</div>}
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
