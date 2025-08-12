// app/page.tsx
import SearchBox from "@/components/SearchBox";
import HomeMap from "@/components/HomeMap";

export default function Page() {
  // ここでは window/document を使わない
  return (
    <main style={{ padding: 16 }}>
      <h1>こまない.com</h1>
      <SearchBox />
      <div style={{ marginTop: 12 }}>
        <HomeMap />
      </div>
    </main>
  );
}
