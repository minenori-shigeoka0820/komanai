// app/page.tsx
import SearchBox from "@/components/SearchBox";
import HomeMap from "@/components/HomeMap";
import RegisterPrompt from "@/components/RegisterPrompt";

export default function Page() {
  return (
    <main className="max-w-5xl mx-auto p-4 grid md:grid-cols-2 gap-6">
      <section>
        <h1 className="text-xl font-bold mb-3">交差点検索</h1>
        <SearchBox />
        <RegisterPrompt onOpen={(init) => {
          // ここであなたの既存 RegisterDrawer を開く（例）
          window.dispatchEvent(new CustomEvent("open-register-drawer", { detail: init }));
        }} />
      </section>
      <section>
        <HomeMap />
      </section>
    </main>
  );
}
