// components/HomeMap.tsx
"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// SSRを切ったreact-leafletコンポーネント
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import("react-leaflet").then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import("react-leaflet").then(m => m.Marker),       { ssr: false });
const useMap       = dynamic(() => import("react-leaflet").then(m => m.useMap),       { ssr: false });

// デフォルトアイコン（CDN参照で“ピンが出ない”問題を回避。public 配置は不要）
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom); }, [center, zoom, map]);
  return null;
}

export default function HomeMap() {
  const [center, setCenter] = useState<[number, number]>([35.681236, 139.767125]); // 東京駅
  const [zoom, setZoom] = useState(15);
  const [marker, setMarker] = useState<[number, number] | null>(null);

  // SearchBox参照用の地図中心シェア
  useEffect(() => { (window as any).__komanai_view = { lat: center[0], lng: center[1] }; }, []);
  useEffect(() => { (window as any).__komanai_view = { lat: center[0], lng: center[1] }; }, [center]);

  // 外部イベント（SearchBoxから）
  useEffect(() => {
    const onFly = (e: any) => {
      const { lat, lng, zoom: z } = e.detail || {};
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const c: [number, number] = [lat, lng];
        setCenter(c);
        setMarker(c);
        setZoom(z ?? 17);
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
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: "100%", width: "100%", borderRadius: 16 }}
      whenCreated={(map) => {
        map.on("click", (e: any) => {
          const lat = e.latlng.lat, lng = e.latlng.lng;
          const c: [number, number] = [lat, lng];
          setCenter(c);
          setMarker(c);
          setZoom(map.getZoom());
          (window as any).__komanai_view = { lat, lng };
          window.dispatchEvent(new CustomEvent("komanai:register-draft", { detail: { lat, lng } }));
        });
      }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {marker && (
        <>
          <Marker position={marker} />
          <FlyTo center={marker} zoom={zoom} />
        </>
      )}
    </MapContainer>
  );
}
