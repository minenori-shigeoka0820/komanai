// components/RegisterPrompt.tsx
"use client";
import { useEffect, useState } from "react";

export default function RegisterPrompt({ onOpen }: { onOpen: (init: { q?:string; lat?:number; lng?:number }) => void }) {
  const [draft, setDraft] = useState<{ q?:string; lat?:number; lng?:number }|null>(null);

  useEffect(() => {
    const onSuggest = (e:any) => setDraft({ q: e.detail?.q });
    const onDraft = (e:any) => setDraft((d)=>({ ...(d ?? {}), lat: e.detail?.lat, lng: e.detail?.lng }));
    window.addEventListener("komanai:register-suggest", onSuggest);
    window.addEventListener("komanai:register-draft", onDraft);
    return () => {
      window.removeEventListener("komanai:register-suggest", onSuggest);
      window.removeEventListener("komanai:register-draft", onDraft);
    };
  }, []);

  if (!draft) return null;
  return (
    <div className="mt-3 rounded-xl border bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-sm text-amber-900">
        該当が見つかりませんでした。位置をご存知なら登録にご協力ください。
      </div>
      <button
        className="rounded-lg px-3 py-2 bg-amber-600 text-white hover:bg-amber-700 active:translate-y-[1px]"
        onClick={() => onOpen(draft)}
      >
        登録フォームを開く
      </button>
    </div>
  );
}

