// components/HomeMap.tsx
"use client";
import { useEffect, useState } from "react";

/**
 * ビルド復旧用のダミー地図コンポーネント。
 * - 追加パッケージ不要（react-leafletを使わない）
 * - SearchBox が参照する window.__komanai_view を維持
 * - komanai:flyto / komanai:reset イベントにのみ反応（座標を内部表示）
 */
export default function HomeMap() {
  const [center, setCenter] = useState<[number, number]>([35.681236, 139.767125]); // 東京駅
  const [marker, setMarker] = useState<[number, number] | null>(null);

  // 初期化：SearchBox 用に地図中心を共有
  useEffect(() => {
    (window as any).__komanai_view = { lat: center[0], lng: center[1] };
  }, []);

  // center 変更のたびに共有
  useEffect(() => {
    (window as any).__komanai_view = { lat: center[0], lng: center[1] };
  }, [center]);

  // 外部イベントを処理（flyto / reset）
  useEffect(() => {
    const onFly = (e: any) => {
      const { lat, lng } = e.detail || {};
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const c: [number, number] = [lat, lng];
        setCenter(c);
        setMarker(c);
      }
    };
    const onReset = () => setMarker(null);

    window.addEventListener("komanai:flyto", onFly);
    window.addEventListener("komanai:reset", onReset);
    return () => {
      window.removeEventListener("komanai:flyto", onFly);
      window.removeEventListener("komanai:reset", onReset);
    };
  }, []);

  return (
    <div
      style={{
        height: 520,
        width: "100%",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        textAlign: "center",
        padding: 16,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>（一時復旧）地図表示は停止中</div>
        <div style={{ fontSize: 12 }}>
          中心：{center[0].toFixed(5)}, {center[1].toFixed(5)}
          {marker ? ` ／ ピン：${marker[0].toFixed(5)}, ${marker[1].toFixed(5)}` : ""}
        </div>
      </div>
    </div>
  );
}
