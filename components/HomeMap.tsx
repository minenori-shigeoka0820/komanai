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

      // 壊れ画像対策：デフォルトアイコンURLを指定
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

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

      // 近傍の交差点ノードへスナップ（なければ元座標）
      async function snapToIntersection(lat: number, lng: number) {
        // 半径60→120mまで探す
        const radii = [60, 90, 120];
        for (const r of radii) {
          const q = `
            [out:json][timeout:10];
            (
              node(around:${r}, ${lat}, ${lng})["highway"~"traffic_signals|stop|crossing"];
              node(around:${r}, ${lat}, ${lng})["junction"~"yes|intersection|roundabout"];
            );
            out tags center 50;
          `;
          try {
            const res = await fetch("https://overpass-api.de/api/interpreter", {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: q,
            });
            const data = await res.json();
            const items =
              data?.elements?.map((e: any) => {
                const y = e.lat ?? e.center?.lat;
                const x = e.lon ?? e.center?.lon;
                const d = Math.hypot(lat - y, lng - x);
                const name = e.tags?.["name:ja"] || e.tags?.name || "";
                return { lat: y, lng: x, d, name };
              }) || [];
            if (items.length) {
              items.sort((a: any, b: any) => a.d - b.d);
              return items[0]; // 最も近い交差点ぽいノード
            }
          } catch {
            // 次の半径で再試行
          }
        }
        return { lat, lng, name: "" };
      }

      // 交差点名を極力取得：Overpass（name系）→ Nominatim（住所）
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
            if (pick) return { name: pick.name, address: pick.name };
          }
        } catch {}

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

      async function placeMarker(lat: number, lng: number, zoom?: number) {
        // まず交差点へスナップ
        const snapped = await snapToIntersection(lat, lng);
        const useLat = snapped.lat ?? lat;
        const useLng = snapped.lng ?? lng;

        if (zoom) map.setView([useLat, useLng], zoom);
        else map.setView([useLat, useLng], map.getZoom());

        if (marker) map.removeLayer(marker);
        marker = L.marker([useLat, useLng]).addTo(map);

        try {
          const { name, address } = await reverseGeocode(useLat, useLng);
          marker.bindPopup(`${name}<br/><small>${address}</small>`).openPopup();
          onSelect?.({ name, lat: useLat, lng: useLng, address });
        } catch {
          marker
            .bindPopup(
              `位置: ${useLat.toFixed(5)}, ${useLng.toFixed(5)}<br/><small>名称取得に失敗</small>`
            )
            .openPopup();
          onSelect?.({
            name: "",
            lat: useLat,
            lng: useLng,
            address: `${useLat.toFixed(5)}, ${useLng.toFixed(5)}`,
          });
        }
      }

      // 地図クリック
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        placeMarker(lat, lng);
      });

      // 検索からのフライ（SearchBox からのイベント）
      const onFly = (ev: any) => {
        const { lat, lng, zoom = 17 } = ev.detail || {};
        if (typeof lat === "number" && typeof lng === "number") {
          placeMarker(lat, lng, zoom);
        }
      };
      window.addEventListener("komanai:flyto", onFly);
      return () => window.removeEventListener("komanai:flyto", onFly);
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
