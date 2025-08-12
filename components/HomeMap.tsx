"use client";

import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

export default function HomeMap() {
  useEffect(() => {
    (async () => {
      // ✅ SSR回避：Leafletはクライアントで動的import
      const L = await import("leaflet");

      // デフォルトアイコン（壊れ画像対策）
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map("map").setView([35.681236, 139.767125], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      let marker: any = null;

      // SearchBox からの移動（座標はそのまま使う）
      const onFly = (e: any) => {
        const { lat, lng, zoom = 17, name = "地点" } = e.detail || {};
        if (typeof lat !== "number" || typeof lng !== "number") return;
        map.setView([lat, lng], zoom);
        if (marker) map.removeLayer(marker);
        marker = (L as any).marker([lat, lng]).addTo(map).bindPopup(name).openPopup();
      };
      window.addEventListener("komanai:flyto", onFly);

      // クリーンアップ
      return () => {
        window.removeEventListener("komanai:flyto", onFly);
        map.remove();
      };
    })();
  }, []);

  return <div id="map" style={{ width: "100%", height: "100vh" }} />;
}
