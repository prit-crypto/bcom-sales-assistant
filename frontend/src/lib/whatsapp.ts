/** WhatsApp click-to-chat link. Without a number, WhatsApp asks the user to pick a chat. */
export function buildWhatsAppLink(message: string, phoneNumber?: string): string {
  const digits = phoneNumber?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
