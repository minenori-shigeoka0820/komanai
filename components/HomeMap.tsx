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

      // ★ 重要：デフォルトアイコンのURLを明示（壊れた画像対策）
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // 地図初期化（ホイール拡縮ON）
      const map = L.map("map", {
        zoomControl: true,
        scrollWheelZoom: true,
        dragging: true,
      }).setView([35.681236, 139.767125], 11);

      L.tileLayer(
        `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
        { attribution: "&copy; OpenStreetMap contributors" }
      ).addTo(map);

      let marker: any;

      // 交差点名をできるだけ正確に取る：Overpass →（なければ）Nominatim
      async function reverseGeocode(lat: number, lng: number) {
        const overpassQL = `
          [out:json][timeout:10];
          (
            node(around:60, ${lat}, ${lng})["highway"~"traffic_signals|stop|crossing"]["name"];
            node(around:60, ${lat}, ${lng})["junction"]["name"];
            way(around:60, ${lat}, ${lng})["junction"]["name"];
          );
          out tags center 20;
        `;
        try {
          const oRes = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: overpassQL,
          });
          const oData = await oRes.json();
          if (oData?.elements?.length) {
            const pick = oData.elements
              .map((e: any) => {
                const y = e.lat ?? e.center?.lat;
                const x = e.lon ?? e.center?.lon;
                const d = Math.hypot(lat - y, lng - x);
                const tags = e.tags || {};
                const name = tags["name:ja"] || tags["name"] || "";
                return { d, name };
              })
              .filter((v: any) => v.name)
              .sort((a: any, b: any) => a.d - b.d)[0];

            if (pick) {
              return { name: pick.name, address: pick.name };
            }
          }
        } catch {
          // noop
        }

        try {
          const nRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=19&accept-language=ja&addressdetails=1&namedetails=1`,
            { headers: { "User-Agent": "komanai.com demo" } as any }
          );
          const n = await nRes.json();
          const name =
            n?.namedetails?.["name:ja"] ||
            n?.namedetails?.name ||
            n?.name ||
            "";
          const address =
            n?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          return { name: name || "名称未取得", address };
        } catch {
          return { name: "", address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
        }
      }

      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;

        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(map);

        try {
          const { name, address } = await reverseGeocode(lat, lng);
          marker.bindPopup(`${name}<br/><small>${address}</small>`).openPopup();
          onSelect?.({ name, lat, lng, address });
        } catch {
          marker
            .bindPopup(
              `位置: ${lat.toFixed(5)}, ${lng.toFixed(5)}<br/><small>名称取得に失敗</small>`
            )
            .openPopup();
          onSelect?.({
            name: "",
            lat,
            lng,
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
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
