"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

const HomeMap = dynamic(() => import("../components/HomeMap"), { ssr: false });

export default function Page() {
  return (
    <main style={{ padding: 16 }}>
      <h1>こまない.com（雛形）</h1>
      <p>全国の無駄に混雑する交差点のクチコミを集めて、原因と改善策を見える化します。</p>
      <HomeMap />
      <section style={{ marginTop: 24 }}>
        <h2>投稿フォーム（雛形）</h2>
        <form method="POST" action="/api/reports">
          <label>
            交差点名：
            <input name="location_name" required />
          </label>
          <br />
          <label>
            混雑レベル（1-5）：
            <input name="congestion_level" type="number" min={1} max={5} required />
          </label>
          <br />
          <label>
            原因（自由記述）：
            <textarea name="cause_text" />
          </label>
          <br />
          <label>
            改善案（自由記述）：
            <textarea name="proposal_text" />
          </label>
          <br />
          <div data-turnstile-widget></div>
          <button type="submit">投稿</button>
        </form>
      </section>
    </main>
  );
}
