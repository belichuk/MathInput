import { useState } from "react";
import { MathInput } from "../src";

export function Demo() {
  const [latex, setLatex] = useState("");
  return (
    <main className="min-h-screen bg-[#f7f8fb] p-3 sm:p-6">
      <section className="min-h-[calc(100vh-1.5rem)] w-full rounded-2xl border-2 border-slate-200 bg-white p-6 sm:min-h-[calc(100vh-3rem)] sm:p-10" aria-label="Formula working area">
        <MathInput value={latex} onChange={setLatex} placeholder="Show your working…" className="max-w-none" />
      </section>
    </main>
  );
}
