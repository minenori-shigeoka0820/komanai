"use client";
import { useEffect, useRef, useState } from "react";

type Cand = { name: string; lat: number; lng: number; city?: string; source: "exact" | "partial" | "live" };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Cand[]>([]);
  const [open, setOpen] = useState(false);

  // 状態表示
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // ボタンの押下演出
  const [pressSearch, setPressSearch] = useState(false);
  const [pressReset, setPressReset] = useState(false);

  // 進行中の検索を中断するためのコントローラ
  const ctrlRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 投稿ドラフト
  const [draftName, setDraftName] = useState("");
  const [draftAddr, setDraftAddr] = useState("");
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 地図クリック（pick）で住所と座標を取り込む
  useEffect(() => {
    const onPick = (ev: any) => {
      const { lat, lng, address } = ev.detail || {};
      if (typeof lat === "number" && typeof lng === "number") {
        setDraftLat(lat);
        setDraftLng(lng);
        if (!draftAddr) setDraftAddr(address || "");
      }
    };
    window.addEventListener("komanai:picked", onPick);
    return () => window.removeEventListener("komanai:picked", onPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftAddr]);

  function abortOngoing() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (ctrlRef.current) {
      try { ctrlRef.current.abort(); } catch {}
      ctrlRef.current = null;
    }
  }

  async function runSearch() {
    setMsg(null);
    const s = q.trim();
    if (!s) {
      setItems([]);
      setOpen(false);
      setStatus("キーワードを入力してください。");
      return;
    }

    // 進行中の検索は中断
    abortOngoing();

    // 現在地（地図中心）をAPIへ
    // @ts-ignore
    const view = (window.__komanai_view as { lat: number; lng: number }) || null;
    const url = new URL(`/api/search`, window.location.origin);
    url.searchParams.set("q", s);
    if (view) {
      url.searchParams.set("lat", String(view.lat));
      url.searchParams.set("lng", String(view.lng));
    }

    // UI: ローディング開始
    setLoading(true);
    setStatus("検索中…");

    // 新しいコントローラを作成
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    // 10秒でタイムアウト
    timeoutRef.current = setTimeout(() => {
      ctrl.abort();
    }, 10000);

    try {
      const res = await fetch(url.toString(), { cache: "no-store", signal: ctrl.signal });
      const js = await res.json().catch(() => ({ items: [] }));
      const arr: Cand[] = js.items || [];

      // ソース優先度: exact > live > partial
      const rank = { exact: 0, live: 1, partial: 2 } as const;
      arr.sort((a, b) => rank[a.source] - rank[b.source]);

      setItems(arr);
      setOpen(true);

      if (arr.length > 0) {
        setStatus(`${arr.length}件ヒットしました。`);
      } else {
        setStatus("該当なし（データベース登録なしの可能性）。地図をクリックして投稿できます。");
      }

      // 候補マーカーの描画/クリア
      if (arr.length > 0 && arr.every((i) => i.source !== "exact")) {
        window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: arr } }));
      } else {
        window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
      }
    } catch (e: any) {
      const aborted = e?.name === "AbortError";
      if (aborted) {
        setStatus("検索がタイムアウトしました（10秒）。もう一度お試しください。");
      } else {
        setStatus(`検索に失敗しました：${e?.message || "network error"}`);
      }
      setItems([]);
      setOpen(true);
      window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
    } finally {
      // タイマー&コントローラを片付ける
      abortOngoing();
      setLoading(false);
      setPressSearch(false);
    }
  }

  function flyTo(c: Cand) {
    setQ(c.name);
    setOpen(false);
    setStatus(null);
    window.dispatchEvent(new CustomEvent("komanai:flyto", { detail: { lat: c.lat, lng: c.lng, zoom: 17, name: c.name } }));
  }

  function resetAll() {
    // 進行中の検索を中断し、ローディングを必ず解除
    abortOngoing();
    setLoading(false);
    setPressSearch(false);

    setQ("");
    setItems([]);
    setOpen(false);
    setDraftName("");
    setDraftAddr("");
    setDraftLat(null);
    setDraftLng(null);
    setMsg(null);
    setStatus("リセットしました。");
    window.dispatchEvent(new Event("komanai:reset"));
    window.dispatchEvent(new CustomEvent("komanai:candidates", { detail: { items: [] } }));
    setPressReset(false);
  }

  async function submitDraft() {
    if (!draftName || draftLat == null || draftLng == null) {
      setMsg("交差点名と、地図上での地点の指定が必要です。");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/user-intersections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          address: draftAddr.trim(),
          lat: draftLat,
          lng: draftLng,
        }),
      });
      const js = await r.json().catch(() => ({}));
      if (!r.ok || js?.ok === false) {
        setMsg(`保存に失敗しました: ${js?.error || r.statusText}`);
      } else {
        setMsg("保存しました。ご協力ありがとうございます！");
        setDraftName("");
      }
    } catch (e: any) {
      setMsg(`保存に失敗しました: ${e?.message || "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  // ボタンのスタイル（押下演出: 凹み＆影の変化）
  const btnBase = {
    padding: "10px 14px",
    borderRadius: 8,
    cursor: "pointer",
    userSelect: "none" as const,
    transition: "transform .06s ease, box-shadow .06s ease",
  };
  const btnPrimary = (pressed: boolean, disabled?: boolean) => ({
    ...btnBase,
    background: disabled ? "#7fbad9" : "#1976d2",
    color: "#fff",
    border: "1px solid #1976d2",
    transform: pressed ? "translateY(1px)" : "translateY(0)",
    boxShadow: pressed ? "inset 0 2px 4px rgba(0,0,0,.2)" : "0 2px 0 rgba(0,0,0,.1)",
    opacity: disabled ? 0.8 : 1,
  });
  const btnGhost = (pressed: boolean, disabled?: boolean) => ({
    ...btnBase,
    background: "#fff",
    color: "#333",
    border: "1px solid #999",
    transform: pressed ? "translateY(1px)" : "translateY(0)",
    boxShadow: pressed ? "inset 0 2px 4px rgba(0,0,0,.12)" : "0 2px 0 rgba(0,0,0,.06)",
    opacity: disabled ? 0.6 : 1,
  });

  return (
    <div style={{ position: "relative", maxWidth: 760, zIndex: 10001, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 入力＆ボタン */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !loading) runSearch(); }}
          placeholder="例）渋谷駅前交差点 / 大六天 所沢市 / 藤沢 入間市"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8, background: "#fff" }}
          aria-label="交差点検索キーワード"
        />
        <button
          onMouseDown={() => !loading && setPressSearch(true)}
          onMouseUp={() => setPressSearch(false)}
          onMouseLeave={() => setPressSearch(false)}
          onClick={() => !loading && runSearch()}
          disabled={loading}
          style={btnPrimary(pressSearch, loading)}
          aria-busy={loading}
        >
          {loading ? "検索中…" : "検索"}
        </button>
        <button
          onMouseDown={() => setPressReset(true)}
          onMouseUp={() => setPressReset(false)}
          onMouseLeave={() => setPressReset(false)}
          onClick={resetAll}
          style={btnGhost(pressReset)}
        >
          リセット
        </button>
      </div>

      {/* ステータス */}
      <div aria-live="polite" style={{ minHeight: 20, fontSize: 13, color: "#555" }}>
        {status}
      </div>

      {/* 候補リスト */}
      {open && items.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 22px rgba(0,0,0,0.12)" }}>
          {items.map((c, idx) => (
            <button
              key={`${c.lat},${c.lng},${idx}`}
              type="button"
              onClick={() => {
                setPressSearch(false);
                flyTo(c);
              }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", border: "none",
                background: c.source === "exact" ? "#f8fffb" : c.source === "live" ? "#f7fbff" : "#fff",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {c.name}
                <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
                  {c.city ? ` / ${c.city}` : ""}
                  {c.source === "exact" ? "（キャッシュ）" : c.source === "live" ? "（ライブ）" : "（部分一致）"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 該当なし → 投稿フォーム（黄色バー付き） */}
      {open && items.length === 0 && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}>
          <div style={{ background: "#fff7cc", borderBottom: "1px solid #eee", padding: "8px 12px", borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
            <strong>該当なし：</strong> データベース未登録の可能性があります。地図上の交差点をクリックして位置を指定し、以下のフォームから投稿してください。
          </div>

          <div style={{ padding: 12 }}>
            <ol style={{ margin: "0 0 8px 18px", padding: 0 }}>
              <li>地図上で交差点をクリック（ピンが立ちます）。</li>
              <li>交差点名と住所を入力して「投稿する」。</li>
            </ol>

            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center" }}>
              <div>交差点名 *</div>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="例）渋谷駅前交差点"
                style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
              />

              <div>交差点住所</div>
              <input
                value={draftAddr}
                onChange={(e) => setDraftAddr(e.target.value)}
                placeholder="地図クリックで自動入力されます"
                style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
              />

              <div>選択座標 *</div>
              <div style={{ color: draftLat != null ? "#333" : "#c00" }}>
                {draftLat != null && draftLng != null ? `${draftLat.toFixed(6)}, ${draftLng.toFixed(6)}` : "地図をクリックしてください"}
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                onClick={submitDraft}
                disabled={saving}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: saving ? "#7fbad9" : "#1976d2",
                  color: "#fff",
                  border: "1px solid #1976d2",
                  cursor: "pointer",
                  transition: "transform .06s ease, box-shadow .06s ease",
                }}
              >
                {saving ? "保存中…" : "投稿する"}
              </button>
              {msg && <div style={{ alignSelf: "center", color: /失敗/.test(msg) ? "#c00" : "#0a7" }}>{msg}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
