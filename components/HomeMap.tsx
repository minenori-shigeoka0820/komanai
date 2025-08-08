"use client";

import { useEffect } from "react";
// これが超重要：LeafletのCSSを読み込む
import "leaflet/dist/leaflet.css";

export default function HomeMap() {
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");

      const map = L.map("map", {
        zoomControl: true,
        scrollWheelZoom: false, // ページスクロールを奪わない
        dragging: true,         // 必要なら false にしてもOK
      }).setView([35.681236, 139.767125], 11);

      L.tileLayer(
        `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
        {
          attribution: "&copy; OpenStreetMap contributors",
        }
      ).addTo(map);

      L.marker([35.659, 139.700]).addTo(map).bindPopup("渋谷スクランブル（例）");
    })();
  }, []);

  // 高さを固定（必要なら高さを調整してOK）
  return (
    <div
      id="map"
      style={{
        width: "100%",
        height: 360,
        marginTop: 16,
        borderRadius: 8,
        overflow: "hidden",
      }}
    />
  );
}
