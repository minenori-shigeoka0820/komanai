"use client";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function HomeMap() {
  useEffect(() => {
    const map = L.map("map").setView([35.6812, 139.7671], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    let marker: L.Marker | null = null;
    window.addEventListener("komanai:flyto", (e: any) => {
      const { lat, lng, zoom, name } = e.detail;
      map.setView([lat, lng], zoom);
      if (marker) marker.remove();
      marker = L.marker([lat, lng]).addTo(map).bindPopup(name).openPopup();
    });
  }, []);

  return <div id="map" style={{ height: "100vh" }}></div>;
}
