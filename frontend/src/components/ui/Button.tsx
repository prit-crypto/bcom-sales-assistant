import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "tinted" | "plain" | "whatsapp";
type Size = "regular" | "large";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-on-gold hover:brightness-95 disabled:bg-fill disabled:text-tertiary",
  tinted: "bg-accent-tint text-accent hover:brightness-95 disabled:bg-fill disabled:text-tertiary",
  plain: "text-accent hover:bg-accent-tint disabled:text-tertiary",
  whatsapp: "bg-whatsapp text-white hover:brightness-110 disabled:bg-fill disabled:text-tertiary",
};

const SIZES: Record<Size, string> = {
  regular: "min-h-11 px-5 text-[15px]",
  large: "min-h-12 px-6 text-base",
};

/** Pill button with a 44 px minimum target and feedback the moment it is pressed. */
export function Button({
  variant = "primary",
  size = "regular",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={`pressable inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Same look as Button, for links (downloads, WhatsApp). */
export function buttonClasses(variant: Variant = "primary", size: Size = "regular"): string {
  return `pressable inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${SIZES[size]} ${VARIANTS[variant]}`;
}
