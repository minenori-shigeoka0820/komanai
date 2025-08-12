"use client";
import { useState } from "react";

type Cand = { name: string; lat: number; lng: number; city?: string; source: string };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Cand[]>([]);
  const [status, setStatus] = useState<"idle" | "searching">("idle");

  async function handleSearch() {
    if (!q.trim()) return;
    setStatus("searching");
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const js = await res.json();
    setItems(js.items || []);
    setStatus("idle");
  }

  function handleReset() {
    setQ("");
    setItems([]);
    setStatus("idle");
  }

  function flyTo(c: Cand) {
    setQ(c.name);
    window.dispatchEvent(new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17, name: c.name } }));
  }

  return (
    <div className="search-box">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="交差点名を入力" />
      <button onClick={handleSearch}>{status === "searching" ? "検索中…" : "検索"}</button>
      <button onClick={handleReset}>リセット</button>
      <ul>
        {items.length === 0 && status === "idle" && q && <li>該当なし</li>}
        {items.map((c, i) => (
          <li key={i} onClick={() => flyTo(c)}>
            {c.name} {c.city && `（${c.city}）`}
          </li>
        ))}
      </ul>
    </div>
  );
}
