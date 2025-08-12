"use client";
import { useState } from "react";

type Cand = { name: string; lat: number; lng: number; city?: string; source: "exact" | "partial" | "live" };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Cand[]>([]);
  const [open, setOpen] = useState(false);

  async function runSearch() {
    const s = q.trim();
    if (!s) {
      setItems([]);
      setOpen(false);
      return;
    }
    // 現在の地図中心を取得（HomeMap.tsx側でwindow.__komanai_viewを更新）
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

    // ソース優先度: exact > live > partial
    arr.sort(
      (a, b) =>
        ({ exact: 0, live: 1, partial: 2 }[a.source] -
        ({ exact: 0, live: 1, partial: 2 }[b.source]))
    );

    setItems(arr);
    setOpen(true);

    if (arr.length > 0 && arr.every((i) => i.source !== "exact")) {
      // 候補マーカー表示
      window.dispatchEvent(
        new CustomEvent("komanai:candidates", { detail: { items: arr } })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("komanai:candidates", { detail: { items: [] } })
      );
    }
  }

  function flyTo(lat: number, lng: number, name: string) {
    window.dispatchEvent(
      new CustomEvent("komanai:flyto", { detail: { lat, lng, zoom: 17, name } })
    );
    setOpen(false);
  }

  function resetAll() {
    setQ("");
    setItems([]);
    setOpen(false);
    window.dispatchEvent(new Event("komanai:reset"));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          type="text"
          value={q}
          placeholder="交差点名や地名を入力"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
          style={{
            flex: 1,
            padding: "8px",
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />
        <button
          onClick={runSearch}
          style={{
            padding: "8px 12px",
            background: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          検索
        </button>
        <button
          onClick={resetAll}
          style={{
            padding: "8px 12px",
            background: "#aaa",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          リセット
        </button>
      </div>

      {open && items.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            border: "1px solid #ccc",
            borderRadius: 4,
            maxHeight: 200,
            overflowY: "auto",
            background: "#fff",
            zIndex: 10,
          }}
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              onClick={() => flyTo(item.lat, item.lng, item.name)}
              style={{
                padding: "8px",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
              }}
            >
              {item.name}
              {item.city && (
                <span style={{ color: "#666", marginLeft: 4 }}>
                  ({item.city})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && items.length === 0 && (
        <div style={{ padding: "8px", color: "#666" }}>該当なし</div>
      )}
    </div>
  );
}
