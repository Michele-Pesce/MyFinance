import { it } from "@/messages/it";

export type MessageKey = keyof typeof it;

/** Looks up an Italian string; `{name}` placeholders are replaced from `vars`. Only other locale file needed to add English. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const msg: string = it[key] ?? key;
  return vars ? msg.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : msg;
}
