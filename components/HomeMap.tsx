import { useEffect } from "react";

export default function HomeMap() {
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");
      // 簡易地図（東京中心）
      const map = L.map("map").setView([35.681236, 139.767125], 11);
      L.tileLayer(`https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`, {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);
      L.marker([35.659, 139.700]).addTo(map).bindPopup("渋谷スクランブル（例）");
    })();
  }, []);

  return <div id="map" style={{ width: "100%", height: 360, marginTop: 16 }} />;
}
