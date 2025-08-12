// components/HomeMap.tsx
"use client";
import { useEffect, useState } from "react";

/**
 * ビルド復旧用のダミー地図コンポーネント。
 * - 追加パッケージ不要（react-leafletを使わない）
 * - SearchBoxが参照する window.__komanai_view を維持
 * - komanai:flyto / komanai:reset イベントにだけ反応（座標を内部表示）
 * 動作確認後、元の地図実装に戻せます。
 */
export default function HomeMap() {
  const [center, setCenter] = useState<[number, number]>([35.681236, 139.767125]); // 東京駅
  const [marker, setMarker] = useState<[number, number] | null>(null);

  // 初期化：SearchBox用に地図中心を共有
  useEffect(() => {
    (window as any).__komanai_view = { lat: center[0], lng: center[1] };
  }, []);

  // center変更のたびに共有
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
  },
