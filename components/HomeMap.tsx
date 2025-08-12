"use client";

import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

type SelectInfo = { name: string; lat: number; lng: number; address: string };
type Props = { onSelect?: (info: SelectInfo) => void };

export default function HomeMap({ onSelect }: Props) {
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");

      // 壊れアイコン対策
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const DEFAULT = { lat: 35.681236, lng: 139.767125, zoom: 13 }; // 東京駅

      const map = L.map("map", {
        center: [DEFAULT.lat, DEFAULT.lng],
        zoom: DEFAULT.zoom,
        scrollWheelZoom: true,
        dragging: true,
      });

      L.tileLayer(
        `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
        {
          attribution:
            '<a href="https://www.maptiler.com/" target="_blank">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
          tileSize: 512,
          zoomOffset: -1,
        }
      ).addTo(map);

      let marker: any;
      let candidateLayer: any;

      async function reverseGeocode(lat: number, lng: number) {
        try {
          const nRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=19&accept-language=ja&addressdetails=1&namedetails=1`,
            { headers: { "User-Agent": "komanai.com demo" } as any }
          );
          const n = await nRes.json();
          const address = n?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          // ここでは“住所のみ”を返す（名称は検索側を優先）
          return address;
        } catch {
          return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
      }

      async function placeMarker(lat: number, lng: number, zoom?: number, preferredName?: string) {
        if (candidateLayer) { candidateLayer.clearLayers(); candidateLayer.remove(); candidateLayer = null; }
        if (typeof zoom === "number") map.setView([lat, lng], zoom); else map.setView([lat, lng]);

        if (marker) map.removeLayer(marker);
        marker = (L as any).marker([lat, lng]).addTo(map);

        const address = await reverseGeocode(lat, lng);
        const title = preferredName && preferredName.trim() ? preferredName : ""; // ← 検索で選んだ名称を最優先
        const header = title || "地点";
        marker.bindPopup(`${header}<br/><small>${address}</small>`).openPopup();

        onSelect?.({ name: title || "", lat, lng, address });
      }

      // クリックでマーカー（この場合は名称を持たないので住所のみ表示）
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        placeMarker(lat, lng);
      });

      // 検索からの移動（name を渡せるように）
      const onFly = (ev: any) => {
        const { lat, lng, zoom = 17, name } = ev.detail || {};
        if (typeof lat === "number" && typeof lng === "number") {
          placeMarker(lat, lng, zoom, name);
        }
      };
      window.addEventListener("komanai:flyto", onFly);

      // 候補群描画
      const onCandidates = (ev: any) => {
        const arr: { lat: number; lng: number }[] = (ev.detail?.items || []).map((x: any) => ({ lat: x.lat, lng: x.lng }));
        if (candidateLayer) { candidateLayer.clearLayers(); candidateLayer.remove(); }
        if (!arr.length) return;
        candidateLayer = (L as any).layerGroup(
          arr.map((p) =>
            (L as any).circleMarker([p.lat, p.lng], { radius: 6, weight: 2, color: "red", fillOpacity: 0.5 }).bindTooltip("候補")
          )
        ).addTo(map);
      };
      window.addEventListener("komanai:candidates", onCandidates);

      // リセット
      const onReset = () => {
        if (marker) { map.removeLayer(marker); marker = null; }
        if (candidateLayer) { candidateLayer.clearLayers(); candidateLayer.remove(); candidateLayer = null; }
        map.setView([DEFAULT.lat, DEFAULT.lng], DEFAULT.zoom);
      };
      window.addEventListener("komanai:reset", onReset);

      return () => {
        window.removeEventListener("komanai:flyto", onFly);
        window.removeEventListener("komanai:candidates", onCandidates);
        window.removeEventListener("komanai:reset", onReset);
        map.remove();
      };
    })();
  }, [onSelect]);

  return (
    <div id="map" style={{ width: "100%", height: 360, marginTop: 16, borderRadius: 8, overflow: "hidden" }} />
  );
}
