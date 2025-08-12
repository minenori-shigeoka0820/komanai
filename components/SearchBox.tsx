// components/SearchBox.tsx
"use client";
import { useRef, useState } from "react";

type Cand = { name: string; lat: number; lng: number; city?: string|null; source: "exact"|"partial"|"live" };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Cand[]>([]);
  const [status, setStatus] = useState<"idle"|"loading"|"empty"|"error"|null>("idle");
  const abortRef = useRef<AbortController | null>(null);

  async function doSearch() {
    if (!q.trim()) { setItems([]); setStatus("idle"); return; }
    setStatus("loading");
    setOpen(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const center = (window as any).__komanai_view ?? null;
      const sp = new URLSearchParams({ q: q.trim() });
      if (center?.lat && center?.lng) {
        sp.set("lat", String(center.lat));
        sp.set("lng", String(center.lng));
      }
      const res = await fetch(`/api/search?${sp.toString()}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      const js = await res.json();
      const list: Cand[] = (js?.items ?? []).slice(0, 8);
      setItems(list);
      setStatus(list.length ? "idle" : "empty");
      if (list.length === 0) {
        window.dispatchEvent(new CustomEvent("komanai:register-suggest", { detail: { q } }));
      }
    } catch (e) {
      if ((e as any).name === "AbortError") return;
      setStatus("error");
    } finally {
      setTimeout(() => setStatus("idle"), 50); // ✅ “検索中…”残り対策
    }
  }

  function flyTo(c: Cand) {
    setQ(c.name);
    setOpen(false);
    setStatus(null);
    // ✅ 再ジオコーディングせず、APIの座標だけを使う
    window.dispatchEvent(new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17, name: c.name } }));
  }

  function resetAll() {
    setQ("");
    setItems([]);
    setOpen(false);
    setStatus("idle");
    window.dispatchEvent(new Event("komanai:reset"));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          onKeyDown={(e)=>{ if (e.key === "Enter") doSearch(); }}
          placeholder="交差点名（例：藤沢（入間市））"
          className="flex-1 rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={doSearch}
          disabled={status === "loading"}
          aria-busy={status === "loading"}
          className={[
            "rounded-xl px-4 py-2 font-medium transition-all",
            "bg-blue-600 text-white shadow",
            "active:translate-y-[1px] active:shadow-sm",
            status === "loading" ? "opacity-70 cursor-not-allowed" : "hover:bg-blue-700"
          ].join(" ")}
        >
          {status === "loading" ? "検索中…" : "検索"}
        </button>
        <button
          onClick={resetAll}
          className="rounded-xl px-4 py-2 border bg-white hover:bg-gray-50 active:translate-y-[1px]"
        >
          リセット
        </button>
      </div>

      {open && items.length > 0 && (
        <ul className="rounded-xl border divide-y max-h-72 overflow-auto">
          {items.map((c, i) => (
            <li key={`${c.name}-${i}`}>
              <button
                onClick={()=>flyTo(c)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-500">{c.city ?? "市区町村不明"}・{c.lat.toFixed(6)}, {c.lng.toFixed(6)}・{c.source}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "empty" && q.trim() && (
        <p className="text-sm text-gray-600">該当なし / データベース登録なしの可能性があります。</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">検索中にエラーが発生しました。</p>
      )}
    </div>
  );
}
