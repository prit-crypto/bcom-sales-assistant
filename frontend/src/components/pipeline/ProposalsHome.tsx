"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppBar } from "@/components/ui/AppBar";
import { Banner } from "@/components/ui/Banner";
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { errorMessage, getJson } from "@/lib/client/api";
import { formatDueDate, formatMoney, formatWhen } from "@/lib/format";
import type { ProposalItem, ProposalList, ProposalStatus } from "@/types/api";
import { ProposalStatusPill, STATUS_LABEL } from "./ProposalStatusPill";

type Filter = "all" | ProposalStatus;

const FILTERS: Filter[] = ["all", "draft", "sent", "won", "lost"];

/** The pipeline: what needs a follow-up today, then every proposal, newest change first. */
export function ProposalsHome() {
  const reduce = useReducedMotion();
  const [list, setList] = useState<ProposalList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    getJson<ProposalList>("/proposals")
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => list?.items ?? [], [list]);
  const due = items.filter((item) => item.follow_up_due);
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: items.length, draft: 0, sent: 0, won: 0, lost: 0 };
    items.forEach((item) => (result[item.status] += 1));
    return result;
  }, [items]);
  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (!needle || item.prospect_name.toLowerCase().includes(needle) || item.reference.toLowerCase().includes(needle)),
  );
  const openMonthly = items.filter((item) => item.status === "sent").reduce((sum, item) => sum + item.monthly_saving, 0);

  return (
    <div className="flex min-h-screen flex-col">
      <AppBar
        actions={
          <Link href="/new" className={buttonClasses("primary")}>
            <Icon name="plus" className="size-4" />
            New proposal
          </Link>
        }
      />
      <main className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="type-title text-[28px] font-bold sm:text-[34px]">Proposals</h1>
          <p className="text-base text-secondary">
            {list === null && !error
              ? "Loading…"
              : items.length === 0
                ? "Every invoice you compare is saved here."
                : `${items.length} proposal${items.length === 1 ? "" : "s"}${
                    counts.sent ? ` · ${formatMoney(openMonthly)} a month waiting on ${counts.sent} sent` : ""
                  }`}
          </p>
        </div>

        {error ? (
          <Banner tone="error" title="Could not load the proposals">
            {error}
          </Banner>
        ) : null}

        {due.length > 0 ? (
          <section aria-labelledby="due-title" className="overflow-hidden rounded-[22px] bg-attention-tint">
            <h2 id="due-title" className="flex items-center gap-2 px-5 pt-4 pb-2 text-[15px] font-semibold text-attention-ink">
              <Icon name="bell" className="size-4" />
              Follow up today · {due.length}
            </h2>
            <ul>
              {due.map((item) => (
                <li key={item.id} className="border-t border-attention/20 first:border-t-0">
                  <Link
                    href={`/proposals/${item.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-attention/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{item.prospect_name}</span>
                      <span className="text-[13px] text-attention-ink">
                        Sent {item.sent_at ? formatWhen(item.sent_at) : ""} · follow-up was due{" "}
                        {item.follow_up_on ? formatDueDate(item.follow_up_on) : ""}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-semibold">{formatMoney(item.monthly_saving, item.currency)}/mo</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-full overflow-x-auto">
              <Segmented
                label="Show proposals"
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((value) => ({
                  value,
                  label: `${value === "all" ? "All" : STATUS_LABEL[value]} ${counts[value]}`,
                }))}
              />
            </div>
            <label className="flex h-10 w-full items-center gap-2 rounded-full bg-surface px-4 shadow-card focus-within:ring-4 focus-within:ring-accent/20 sm:w-72">
              <Icon name="search" className="size-4 shrink-0 text-secondary" />
              <span className="sr-only">Search by prospect or reference</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search prospects"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-secondary"
              />
            </label>
          </div>
        ) : null}

        {list !== null && items.length === 0 ? (
          <section className="flex flex-col items-center gap-4 rounded-[28px] bg-surface px-6 py-14 text-center shadow-card">
            <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-[18px] bg-accent-tint text-accent">
              <Icon name="file" className="size-7" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="type-headline text-xl font-semibold">No proposals yet</h2>
              <p className="max-w-[420px] text-secondary">
                Upload a prospect&apos;s courier invoice. When you compare it with BCOM rates, it&apos;s saved here as a draft.
              </p>
            </div>
            <Link href="/new" className={buttonClasses("primary", "large")}>
              Start with an invoice
            </Link>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section aria-label="All proposals" className="overflow-hidden rounded-[22px] bg-surface shadow-card">
            {visible.length === 0 ? (
              <p className="px-6 py-10 text-center text-secondary">No proposals match.</p>
            ) : (
              <ul>
                {visible.map((item, index) => (
                  <motion.li
                    key={item.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.3, delay: Math.min(index, 10) * 0.02 }}
                    className="border-t border-separator first:border-t-0"
                  >
                    <Row item={item} />
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Row({ item }: { item: ProposalItem }) {
  const detail =
    item.status === "sent" && item.follow_up_on
      ? `Follow up ${formatDueDate(item.follow_up_on)}`
      : `${item.compared_shipments} of ${item.total_shipments} shipments compared`;
  return (
    <Link
      href={`/proposals/${item.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-fill-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-6"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-semibold">{item.prospect_name}</span>
        <span className="truncate text-[13px] text-secondary">
          {item.reference} · {formatWhen(item.updated_at)} · {detail}
        </span>
      </span>
      <span className="col-start-2 row-start-1 sm:col-start-auto sm:row-auto">
        <ProposalStatusPill status={item.status} />
      </span>
      <span
        className={`tabular col-span-2 text-left text-[15px] font-semibold sm:col-span-1 sm:min-w-[120px] sm:text-right ${
          item.has_saving ? "text-accent" : "text-bad"
        }`}
      >
        {item.has_saving ? `${formatMoney(item.monthly_saving, item.currency)}/mo` : "No saving"}
      </span>
    </Link>
  );
}
