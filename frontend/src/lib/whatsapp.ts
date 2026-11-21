/**
 * Turns a phone number as a partner types it into the format WhatsApp links need:
 * country code + number, digits only, no leading zeros (e.g. 971501234567, 919876543210).
 *
 * Understands UAE and Indian mobile numbers written locally, and any number written with + or 00.
 * Returns null when the number cannot be understood, so the caller can fall back to the chat picker.
 */
export function toWhatsAppNumber(input: string | undefined): string | null {
  const text = input?.trim() ?? "";
  if (!text) return null;

  let digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) {
    // Already international: +971 50…, +91 98…
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2); // 00971 50… / 0091 98…
  } else if (/^0?5\d{8}$/.test(digits)) {
    digits = `971${digits.replace(/^0/, "")}`; // UAE mobile: 050 123 4567 or 50 123 4567
  } else if (/^0?[6-9]\d{9}$/.test(digits)) {
    digits = `91${digits.replace(/^0/, "")}`; // Indian mobile: 98765 43210 or 098765 43210
  }

  // People often keep the local 0 after the country code: +971 050… / +91 098…
  digits = digits.replace(/^(971|91)0/, "$1");

  // International numbers: 8–15 digits and never starting with 0 (E.164).
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** WhatsApp click-to-chat link. Without a usable number, WhatsApp asks the user to pick a chat. */
export function buildWhatsAppLink(message: string, phoneNumber?: string): string {
  const number = toWhatsAppNumber(phoneNumber) ?? "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
