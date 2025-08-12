// app/page.tsx
import dynamic from "next/dynamic";

// ✅ 地図と検索UIはクライアントだけで描画（SSRしない）
const HomeMap = dynamic(() => import("@/components/HomeMap"), { ssr: false });
const SearchBox = dynamic(() => import("@/components/SearchBox"), { ssr: false });

export default function Page() {
  return (
    <main style={{ padding: 16 }}>
      <h1>こまない.com</h1>
      <p style={{ color: "#555", marginBottom: 12 }}>
        交差点名で検索 / 見つからない場合は地図をクリックして投稿できます。
      </p>
      <SearchBox />
      <div style={{ marginTop: 12 }}>
        <HomeMap />
      </div>
    </main>
  );
}
