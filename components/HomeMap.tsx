// components/HomeMap.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const MapContainer = dynamic(() => import("react-leaflet").then(m=>m.MapContainer), { ssr:false });
const TileLayer = dynamic(() => import("react-leaflet").then(m=>m.TileLayer), { ssr:false });
const Marker = dynamic(() => import("react-leaflet").then(m=>m.Marker), { ssr:false });
const useMap = dynamic(() => import("react-leaflet").then(m=>m.useMap), { ssr:false });

function SetView({ center, zoom }: { center:[number,number]; zoom:number }) {
  const map = (useMap as any)();
  useEffect(()=>{ map.setView(center, zoom, { animate:true }); }, [center, zoom, map]);
  return null;
}

export default function HomeMap() {
  const [center, setCenter] = useState<[number,number]>([35.681236,139.767125]); // 東京駅
  const [zoom, setZoom] = useState(15);
  const [marker, setMarker] = useState<[number,number] | null>(null);
  const refCenter = useRef(center);

  // 地図中心を window に共有（SearchBox が利用）
  useEffect(() => {
    (window as any).__komanai_view = { lat: refCenter.current[0], lng: refCenter.current[1] };
  }, []);

  useEffect(() => {
    refCenter.current = center;
    (window as any).__komanai_view = { lat: center[0], lng: center[1] };
  }, [center]);

  useEffect(() => {
    const onFly = (e: any) => {
      const { lat, lng, zoom: z } = e.detail;
      const c: [number,number] = [lat, lng];
      setCenter(c);
      setMarker(c);
      setZoom(z ?? 17);
    };
    const onReset = () => { setMarker(null); };
    window.addEventListener("komanai:flyto", onFly);
    window.addEventListener("komanai:reset", onReset);
    return () => {
      window.removeEventListener("komanai:flyto", onFly);
      window.removeEventListener("komanai:reset", onReset);
    };
  }, []);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: 520, width:"100%", borderRadius: 16 }}
      whenCreated={(map) => {
        map.on("click", (e: any) => {
          const lat = e.latlng.lat, lng = e.latlng.lng;
          const c: [number,number] = [lat,lng];
          setCenter(c);
          setMarker(c);
          setZoom(map.getZoom());
          (window as any).__komanai_view = { lat, lng };
          window.dispatchEvent(new CustomEvent("komanai:register-draft", { detail: { lat, lng } }));
        });
      }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                 attribution='&copy; OpenStreetMap contributors'/>
      <SetView center={center} zoom={zoom} />
      {marker && <Marker position={marker} />}
    </MapContainer>
  );
}
