"use client";

import { useEffect, useRef, useState } from "react";

type Suggest = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Suggest[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 外クリックで閉じる
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const doSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setList([]);
      return;
    }

    // スペース区切りで AND 条件
    const tokens = trimmed.split(/\s+/).map((s) => s.toLowerCase());

    // MapTiler 前方一致サジェスト
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
      trimmed
    )}.json?limit=8&language=ja&country=jp&autocomplete=true&key=${
      process.env.NEXT_PUBLIC_MAPTILER_KEY
    }`;

    const res = await fetch(url);
    const data = await res.json();

    const out: Suggest[] =
      data?.features
        ?.map((f: any) => {
          const name =
            f?.text_ja || f?.text || f?.place_name_ja || f?.place_name || "";
          const address =
            f?.place_name_ja || f?.place_name || f?.properties?.address || "";
          const [lng, lat] = f?.center || [];
          return { name, address, lat, lng } as Suggest;
        })
        .filter((s: Suggest) => {
          const hay = `${s.name} ${s.address}`.toLowerCase();
          // AND：すべてのトークンを含むものだけ
          return tokens.every((t) => hay.includes(t));
        }) ?? [];

    setList(out);
    setOpen(true);
  };

  // 入力の待ち合わせ（300ms）
  const debounced = useRef(debounce(doSearch, 300)).current;

  const select = (s: Suggest) => {
    setQ(s.name || s.address);
    setOpen(false);

    // 地図にフライ → 交差点名の逆ジオもHomeMap側で実行
    window.dispatchEvent(
      new CustomEvent("komanai:flyto", {
        detail: { lat: s.lat, lng: s.lng, zoom: 17 },
      })
    );
  };

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 560 }}>
      <input
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          debounced(v);
        }}
        onFocus={() => q && list.length && setOpen(true)}
        placeholder="例）渋谷 交差点 / 表参道 青山通り など（AND検索）"
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      />
      {open && list.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "110%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {list.map((s, i) => (
            <button
              key={`${s.lat},${s.lng},${i}`}
              type="button"
              onClick={() => select(s)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                background: "white",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.name || s.address}</div>
              {s.name && (
                <div style={{ fontSize: 12, color: "#555" }}>{s.address}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
