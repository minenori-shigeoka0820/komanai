"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import SearchBox from "../components/SearchBox";

const HomeMap = dynamic(() => import("../components/HomeMap"), { ssr: false });

export default function Page() {
  const [locName, setLocName] = useState("");
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1>こまない.com（雛形）</h1>
      <p>地図をクリック or キーワード検索（AND）で交差点を選べます。</p>

      <div style={{ display: "grid", gap: 12 }}>
        <SearchBox />
        <HomeMap
          onSelect={({ name, lat, lng }) => {
            if (name) setLocName(name);
            setCoords({ lat, lng });
          }}
        />
      </div>

      {coords.lat && coords.lng && (
        <p style={{ marginTop: 8 }}>
          📍 選択座標: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        <h2>投稿フォーム（雛形）</h2>
        <form method="POST" action="/api/reports">
          <label>
            交差点名：
            <input
              name="location_name"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              required
              placeholder="地図クリック or 検索で自動入力"
            />
          </label>
          <br />
          <label>
            混雑レベル（1-5）：
            <input name="congestion_level" type="number" min={1} max={5} required />
          </label>
          <br />
          <label>
            原因（自由記述）：
            <textarea name="cause_text" />
          </label>
          <br />
          <label>
            改善案（自由記述）：
            <textarea name="proposal_text" />
          </label>

          {/* 緯度経度（将来DBに保存する用） */}
          <input type="hidden" name="lat" value={coords.lat ?? ""} />
          <input type="hidden" name="lng" value={coords.lng ?? ""} />

          <br />
          <div data-turnstile-widget></div>
          <button type="submit" style={{ marginTop: 8 }}>投稿</button>
        </form>
      </section>
    </main>
  );
}
