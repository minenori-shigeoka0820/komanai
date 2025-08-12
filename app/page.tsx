// app/page.tsx
import SearchBox from "../components/SearchBox";
import HomeMap from "../components/HomeMap";

export default function Page() {
  return (
    <main style={{ maxWidth: 1200, margin: "24px auto", padding: 16, display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr" }}>
      <section>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>交差点検索</h1>
        <SearchBox />
      </section>
      <section style={{ height: 520 }}>
        <HomeMap />
      </section>
    </main>
  );
}
