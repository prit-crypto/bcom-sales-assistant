"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

type Tone = "attention" | "info" | "error" | "success";

const TONES: Record<Tone, { box: string; iconBox: string; icon: "warning" | "info" | "error" | "refresh" }> = {
  attention: { box: "bg-attention-tint text-attention-ink", iconBox: "bg-attention/25", icon: "warning" },
  info: { box: "bg-surface text-ink shadow-card", iconBox: "bg-fill", icon: "info" },
  error: { box: "bg-bad-tint text-bad", iconBox: "bg-bad/15", icon: "error" },
  success: { box: "bg-accent-tint text-ink", iconBox: "bg-accent/15 text-accent", icon: "refresh" },
};

/** A soft, tinted message with an icon. Errors are announced; the rest are polite status updates. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const style = TONES[tone];
  const reduce = useReducedMotion();
  return (
    <motion.div
      role={tone === "error" ? "alert" : "status"}
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      className={`flex items-start gap-3.5 rounded-2xl px-4 py-3.5 ${style.box}`}
    >
      <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${style.iconBox}`}>
        <Icon name={style.icon} className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-[15px] leading-snug">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </motion.div>
  );
}
