"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import { t, type MessageKey } from "@/lib/i18n";

/** <select> that writes its value into a search param, so the server component re-renders filtered. */
export function ParamSelect({ param, value, options, label }: { param: string; value: string; options: { value: string; label: string }[]; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select aria-label={label} value={value} onChange={(e) => {
      const next = new URLSearchParams(params);
      if (e.target.value) next.set(param, e.target.value); else next.delete(param);
      router.replace(`${path}?${next}`, { scroll: false });
    }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * Runs a server action and shows its error (if any) next to the button.
 * From a Server Component pass the action itself plus `args`: inline closures can't cross to the client.
 */
export function ActionButton({ action, args = [], children, className = "btn", confirm }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (...args: any[]) => Promise<ActionResult>; args?: unknown[]; children: React.ReactNode; className?: string; confirm?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<MessageKey | null>(null);
  const [armed, setArmed] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={() => {
        // Two-step delete, as in the prototype: first tap arms, second confirms.
        if (confirm && !armed) { setArmed(true); return; }
        setArmed(false);
        start(async () => { const r = await action(...args); setMsg(r.ok ? null : (r.error as MessageKey)); });
      }}>
        {armed ? t("common.confirmTap") : children}
      </button>
      {msg && <span className="neg" role="alert" style={{ fontSize: 12 }}>{t(msg)}</span>}
    </>
  );
}
