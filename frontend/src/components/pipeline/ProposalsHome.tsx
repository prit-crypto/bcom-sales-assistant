"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppBar } from "@/components/ui/AppBar";
import { Banner } from "@/components/ui/Banner";
import { buttonClasses } from "@/components/ui/Button";
import { HeroBand } from "@/components/ui/Hero";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { errorMessage, getJson } from "@/lib/client/api";
import { formatDueDate, formatMoney, formatWhen } from "@/lib/format";
import { loadPartnerDefaults } from "@/lib/partnerDefaults";
import type { ProposalItem, ProposalList, ProposalStatus } from "@/types/api";
import { ProposalStatusPill, STATUS_LABEL } from "./ProposalStatusPill";

type Filter = "all" | ProposalStatus;

const FILTERS: Filter[] = ["all", "draft", "sent", "won", "lost"];
const DUBAI = "Asia/Dubai";

/** The partner's first name from the details remembered on this device ("" on the server and before). */
function useFirstName(): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => loadPartnerDefaults().partner_name.trim().split(/\s+/)[0] ?? "",
    () => "",
  );
}

function greeting(now: Date): { en: string; ar: string } {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: DUBAI }).format(now),
  );
  if (hour < 12) return { en: "Good morning", ar: "صباح الخير" };
  if (hour < 18) return { en: "Good afternoon", ar: "مساء الخير" };
  return { en: "Good evening", ar: "مساء الخير" };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** The partner's day: greeting and headline figures, who to call today, then every proposal. */
export function ProposalsHome() {
  const reduce = useReducedMotion();
  const firstName = useFirstName();
  const [now] = useState(() => new Date());
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
  const figures = useMemo(() => {
    const month = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: DUBAI });
    const thisMonth = month.format(now);
    const sent = items.filter((item) => item.status === "sent");
    const wonThisMonth = items.filter(
      (item) =>
        item.status === "won" && item.decided_at && month.format(new Date(item.decided_at)) === thisMonth,
    );
    const decidedOrOut = counts.won + counts.lost + counts.sent;
    return {
      open: sent.reduce((sum, item) => sum + item.monthly_saving, 0),
      openCount: sent.length,
      won: wonThisMonth.reduce((sum, item) => sum + item.monthly_saving, 0),
      wonNames: wonThisMonth.map((item) => item.prospect_name),
      winRate: decidedOrOut ? Math.round((counts.won / decidedOrOut) * 100) : null,
    };
  }, [items, counts, now]);
  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (!needle ||
        item.prospect_name.toLowerCase().includes(needle) ||
        item.reference.toLowerCase().includes(needle)),
  );
  const recent = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const hello = greeting(now);
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: DUBAI,
  }).format(now);

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

      <HeroBand inner="flex flex-col gap-8 pt-12 pb-28 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[15px] text-hero-secondary" suppressHydrationWarning>
              {today} · Dubai
            </p>
            <h1 className="type-title text-[36px] font-bold sm:text-[52px]" suppressHydrationWarning>
              {hello.en}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            <p
              lang="ar"
              dir="rtl"
              className="font-arabic self-start text-xl text-gold"
              suppressHydrationWarning
            >
              {hello.ar}
            </p>
          </div>
          {due[0] ? (
            <Link
              href={`/proposals/${due[0].id}`}
              className="pressable inline-flex min-h-11 items-center gap-2.5 rounded-full bg-hero-raised px-4 text-[15px] font-medium text-hero-ink hover:bg-hero-line focus-visible:outline-2 focus-visible:outline-gold"
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-gold" />
              Call {due[0].prospect_name} today
              <Icon name="chevronRight" className="size-3.5" />
            </Link>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[22px] bg-hero-line lg:grid-cols-4">
          <Figure
            label="Open savings"
            value={formatMoney(figures.open)}
            unit="/ mo"
            detail={
              figures.openCount ? `${figures.openCount} sent, awaiting reply` : "Nothing waiting on a reply"
            }
          />
          <Figure
            label="Won this month"
            value={formatMoney(figures.won)}
            unit="/ mo"
            detail={figures.wonNames.length ? figures.wonNames.slice(0, 2).join(", ") : "None yet this month"}
            highlight
          />
          <Figure
            label="Win rate"
            value={figures.winRate === null ? "–" : `${figures.winRate}%`}
            detail={
              counts.won + counts.lost + counts.sent
                ? `${counts.won} won of ${counts.won + counts.lost + counts.sent} sent`
                : "Send a proposal to start"
            }
          />
          <Figure
            label="Follow-ups due"
            value={String(due.length)}
            detail={due[0] ? `${due[0].prospect_name}` : "All caught up"}
            gold
          />
        </dl>
      </HeroBand>

      <main className="mx-auto -mt-16 flex w-full max-w-[1200px] flex-1 flex-wrap items-start gap-5 px-4 pb-16 sm:px-6">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-5">
          {error ? (
            <Banner tone="error" title="Could not load the proposals">
              {error}
            </Banner>
          ) : null}

          {due.length > 0 ? (
            <section
              aria-labelledby="due-title"
              className="overflow-hidden rounded-[22px] bg-surface shadow-raised"
            >
              <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-2 sm:px-6">
                <h2 id="due-title" className="type-title text-[22px] font-bold">
                  Follow up today · {due.length}
                </h2>
                <span className="hidden text-[13px] text-secondary sm:inline">Sent proposals due a call</span>
              </div>
              <ul>
                {due.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/proposals/${item.id}`}
                      className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-fill-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-6"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-tint text-[15px] font-bold text-gold-ink"
                      >
                        {initials(item.prospect_name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[17px] font-semibold">{item.prospect_name}</span>
                        <span className="text-[13px] font-medium text-gold-ink">
                          Sent {item.sent_at ? formatWhen(item.sent_at) : ""} · follow-up was due{" "}
                          {item.follow_up_on ? formatDueDate(item.follow_up_on) : ""}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[17px] font-semibold">
                        {formatMoney(item.monthly_saving, item.currency)}/mo
                      </span>
                      <Icon name="chevronRight" className="size-3.5 shrink-0 text-tertiary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {list !== null && items.length === 0 ? (
            <section className="flex flex-col items-center gap-4 rounded-[28px] bg-surface px-6 py-14 text-center shadow-raised">
              <span
                aria-hidden="true"
                className="flex size-14 items-center justify-center rounded-[18px] bg-accent-tint text-accent"
              >
                <Icon name="file" className="size-7" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="type-title text-[22px] font-bold">No proposals yet</h2>
                <p className="max-w-[420px] text-secondary">
                  Upload a prospect&apos;s courier invoice. When you compare it with BCOM rates, it&apos;s
                  saved here as a draft.
                </p>
              </div>
              <Link href="/new" className={buttonClasses("primary", "large")}>
                Start with an invoice
              </Link>
            </section>
          ) : null}

          {items.length > 0 ? (
            <section
              aria-labelledby="all-title"
              className="overflow-hidden rounded-[22px] bg-surface shadow-raised"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3.5 sm:px-6">
                <h2 id="all-title" className="type-title text-[22px] font-bold">
                  Proposals
                </h2>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="max-w-full overflow-x-auto">
                    <Segmented
                      label="Show proposals"
                      size="small"
                      value={filter}
                      onChange={setFilter}
                      options={FILTERS.map((value) => ({
                        value,
                        label: `${value === "all" ? "All" : STATUS_LABEL[value]} ${counts[value]}`,
                      }))}
                    />
                  </div>
                  <label className="flex h-9 w-full items-center gap-2 rounded-[10px] bg-fill px-3 focus-within:ring-4 focus-within:ring-accent/20 sm:w-56">
                    <Icon name="search" className="size-4 shrink-0 text-secondary" />
                    <span className="sr-only">Search by prospect or reference</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search"
                      className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-secondary"
                    />
                  </label>
                </div>
              </div>
              {visible.length === 0 ? (
                <p className="border-t border-separator px-6 py-10 text-center text-secondary">
                  No proposals match.
                </p>
              ) : (
                <ul role="list" aria-label="All proposals">
                  {visible.map((item, index) => (
                    <motion.li
                      key={item.id}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        bounce: 0,
                        duration: 0.3,
                        delay: Math.min(index, 10) * 0.02,
                      }}
                    >
                      <Row item={item} first={index === 0} />
                    </motion.li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        {items.length > 0 ? (
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section
              aria-labelledby="start-title"
              className="flex flex-col gap-3 rounded-[22px] bg-surface p-6 shadow-raised"
            >
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-[14px] bg-accent-tint text-accent"
              >
                <Icon name="upload" className="size-6" />
              </span>
              <h2 id="start-title" className="type-title text-xl font-bold">
                Met a new prospect?
              </h2>
              <p className="text-[15px] leading-snug text-secondary">
                Photograph or upload their last courier invoice. The savings are ready before the coffee is.
              </p>
              <Link href="/new" className={`${buttonClasses("tinted")} self-start`}>
                Start with an invoice
              </Link>
            </section>
            {recent.length > 0 ? (
              <section
                aria-labelledby="recent-title"
                className="flex flex-col gap-3.5 rounded-[22px] bg-surface p-6 shadow-card"
              >
                <h2 id="recent-title" className="text-[17px] font-semibold">
                  Recently updated
                </h2>
                <ol className="flex flex-col gap-3.5">
                  {recent.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          item.status === "won" ? "bg-accent" : item.follow_up_due ? "bg-gold" : "bg-tertiary"
                        }`}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[15px]">
                          {item.prospect_name} · {STATUS_LABEL[item.status].toLowerCase()}
                        </span>
                        <span className="text-[13px] text-secondary">{formatWhen(item.updated_at)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </aside>
        ) : null}
      </main>
    </div>
  );
}

function Figure({
  label,
  value,
  unit,
  detail,
  highlight = false,
  gold = false,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  highlight?: boolean;
  gold?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-hero-raised px-4 py-4 sm:px-6 sm:py-5">
      <dt className={`text-[13px] ${gold ? "text-gold" : "text-hero-secondary"}`}>{label}</dt>
      <dd
        className={`type-title tabular text-[22px] font-bold whitespace-nowrap sm:text-[32px] ${gold ? "text-gold" : highlight ? "text-hero-save" : ""}`}
      >
        {value}
        {unit ? (
          <span className="text-[13px] font-medium text-hero-secondary sm:text-[15px]"> {unit}</span>
        ) : null}
      </dd>
      <dd className="truncate text-[13px] text-hero-secondary">{detail}</dd>
    </div>
  );
}

function Row({ item, first }: { item: ProposalItem; first: boolean }) {
  const detail =
    item.status === "sent" && item.follow_up_on
      ? `Follow up ${formatDueDate(item.follow_up_on)}`
      : `${item.compared_shipments} of ${item.total_shipments} shipments compared`;
  return (
    <Link
      href={`/proposals/${item.id}`}
      className="group flex items-center gap-3.5 px-5 hover:bg-fill-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-6"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-fill text-[15px] font-bold text-secondary"
      >
        {initials(item.prospect_name)}
      </span>
      <span
        className={`flex min-w-0 flex-1 items-center gap-3 py-3.5 ${first ? "" : "border-t border-separator"}`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[17px] font-semibold">{item.prospect_name}</span>
            <ProposalStatusPill status={item.status} />
          </span>
          <span className="truncate text-[13px] text-secondary">
            {item.reference} · {formatWhen(item.updated_at)} · {detail}
          </span>
        </span>
        <span
          className={`tabular shrink-0 text-[17px] font-semibold ${item.has_saving ? "text-accent" : "text-bad"}`}
        >
          {item.has_saving ? `${formatMoney(item.monthly_saving, item.currency)}/mo` : "No saving"}
        </span>
        <Icon name="chevronRight" className="size-3.5 shrink-0 text-tertiary" />
      </span>
    </Link>
  );
}
