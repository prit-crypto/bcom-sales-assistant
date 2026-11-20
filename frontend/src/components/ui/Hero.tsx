import type { ReactNode } from "react";

/**
 * The graphite band at the top of the main screens, like an Apple product page. Content placed after it
 * can overlap its lower edge (a negative top margin) so cards float over the band.
 */
export function HeroBand({
  children,
  className = "",
  inner = "",
  width = "max-w-[1200px]",
}: {
  children: ReactNode;
  className?: string;
  inner?: string;
  /** The content width, matching the page below the band */
  width?: string;
}) {
  return (
    <section className={`bg-hero text-hero-ink ${className}`}>
      <div className={`mx-auto w-full px-4 sm:px-6 ${width} ${inner}`}>{children}</div>
    </section>
  );
}

/** A compact graphite header for working screens: a title, a line under it, and optional actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
  width = "max-w-[1200px]",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** The content width, matching the page below the header */
  width?: string;
}) {
  return (
    <HeroBand width={width} inner="pt-8 pb-9 sm:pt-10 sm:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="type-title text-[30px] font-bold sm:text-[40px]">{title}</h1>
          {subtitle ? <div className="text-[17px] text-hero-secondary">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </HeroBand>
  );
}
