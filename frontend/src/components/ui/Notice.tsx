import type { ReactNode } from "react";

type Tone = "info" | "warn" | "error" | "success";

const TONES: Record<Tone, string> = {
  info: "border-line bg-band text-ink",
  warn: "border-warn/30 bg-warn-soft text-warn",
  error: "border-bad/30 bg-bad-soft text-bad",
  success: "border-good/30 bg-good-soft text-good",
};

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}
