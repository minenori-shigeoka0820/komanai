// components/HomeMap.tsx
"use client";
import { useEffect, useState } from "react";

/**
 * 一時復旧用のダミー地図コンポーネント
 * - react-leaflet を使わない
 * - SearchBox からのイベント (flyto / reset) だけに反応
 */
export default function HomeMap() {
  const [center, setCenter] = useState<[number, number]>([35.681236, 139.767125]); // 東京駅
  const [marker, setMarker] = useState<[number, number] | null>(null);

  // 初期化：現在の中心を共有
  useEffect(() => {
    (window as any).__komanai_view = { lat: center[0], lng: center[1] };
  }, []);

  // 中心が変わるたび共有
  useEffect(() => {
    (window as any).__komanai_view = { lat: center[0], lng: center[1] };
  }, [center]);

  // 外部イベントを処理
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
        height: "400px",
        border: "2px dashed gray",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "14px",
        color: "gray",
      }}
    >
      【一時復旧用のプレースホルダー地図】
      <br />
      中心座標: {center[0].toFixed(5)}, {center[1].toFixed(5)}
      {marker && (
        <>
          <br />
          マーカー: {marker[0].toFixed(5)}, {marker[1].toFixed(5)}
        </>
      )}
    </div>
  );
}
