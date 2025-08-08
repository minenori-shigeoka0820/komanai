"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export default function HomeMap() {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const L = await import("leaflet");

      // 地図の初期化（東京駅あたり）
      const map = L.map("map", {
        center: [35.681236, 139.767125],
        zoom: 13,
        scrollWheelZoom: true, // マウスホイールで拡縮可能
      });

      // タイルレイヤー
      L.tileLayer(
        `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
        {
          attribution:
            '<a href="https://www.maptiler.com/" target="_blank">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
          tileSize: 512,
          zoomOffset: -1,
        }
      ).addTo(map);

      // クリック時に交差点名を取得
      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ja&zoom=19`,
            { headers: { "User-Agent": "komanai.com demo" } as any }
          );
          const data = await res.json();
          const name =
            data?.name ||
            data?.address?.neighbourhood ||
            data?.address?.suburb ||
            "名称不明";

          L.popup()
            .setLatLng([lat, lng])
            .setContent(`<b>${name}</b>`)
            .openOn(map);
        } catch (err) {
          console.error(err);
        }
      });

      // flytoイベントで指定座標へ移動＋マーカー
      window.addEventListener("komanai:flyto", (ev: any) => {
        const { lat, lng, zoom } = ev.detail || {};
        if (lat && lng) {
          map.flyTo([lat, lng], zoom || 17);
          L.marker([lat, lng]).addTo(map);
        }
      });

      // candidatesイベントで複数候補を表示
      let candidateLayer: any;
      function drawCandidates(items: { lat: number; lng: number }[]) {
        if (candidateLayer) {
          candidateLayer.clearLayers();
          candidateLayer.remove();
        }
        if (!items.length) return;
        candidateLayer = (L as any)
          .layerGroup(
            items.map((p) =>
              (L as any)
                .circleMarker([p.lat, p.lng], {
                  radius: 6,
                  weight: 2,
                  color: "red",
                  fillColor: "#f03",
                  fillOpacity: 0.5,
                })
                .bindTooltip("候補")
            )
          )
          .addTo(map);
      }

      window.addEventListener("komanai:candidates", (ev: any) => {
        const arr = (ev.detail?.items || []).map((x: any) => ({
          lat: x.lat,
          lng: x.lng,
        }));
        drawCandidates(arr);
      });

      mapRef.current = map;
    })();
  }, []);

  return (
    <div
      id="map"
      style={{
        width: "100%",
        height: "100vh",
        zIndex: 1,
      }}
    />
  );
}
