"use client";

import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

type Props = {
  onSelect?: (info: {
    name: string;
    lat: number;
    lng: number;
    address: string;
  }) => void;
};

export default function HomeMap({ onSelect }: Props) {
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");

      const map = L.map("map", {
        zoomControl: true,
        scrollWheelZoom: true,   // ← マウスホイール拡縮を有効に
        dragging: true,
      }).setView([35.681236, 139.767125], 11);

      const tile = L.tileLayer(
        `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
        { attribution: "&copy; OpenStreetMap contributors" }
      ).addTo(map);

      let marker: any;

      async function reverseGeocode(lat: number, lng: number) {
        // MapTilerの逆ジオ（経度,緯度の順！）
        const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}&limit=1&language=ja`;
        const res = await fetch(url);
        const data = await res.json();
        const f = data?.features?.[0];

        // 候補名（交差点名っぽいテキスト）と住所候補
        const name =
          f?.text_ja || f?.text || f?.place_name_ja || f?.place_name || "名称未取得";
        const address =
          f?.place_name_ja || f?.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        return { name, address };
      }

      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;

        // マーカーを更新
        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(map);

        try {
          const { name, address } = await reverseGeocode(lat, lng);
          marker.bindPopup(`${name}<br/><small>${address}</small>`).openPopup();

          onSelect?.({ name, lat, lng, address });
        } catch (err) {
          marker.bindPopup(`位置: ${lat.toFixed(5)}, ${lng.toFixed(5)}<br/><small>名称取得に失敗</small>`).openPopup();
          onSelect?.({
            name: "",
            lat,
            lng,
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          });
        }
      });
    })();
  }, [onSelect]);

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
