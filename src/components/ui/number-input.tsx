"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Keep digits, one decimal point and a leading minus; "5." and ".5" stay typeable. */
export function cleanNumber(input: string): string {
  let s = input.replace(/[^\d.\-]/g, "");
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  s = s.replace(/^0+(?=\d)/, "");
  if (s.startsWith(".")) s = `0${s}`;
  return (negative ? "-" : "") + s;
}

/** "1234567.5" → "1,234,567.5". Only the whole-number part is grouped. */
export function groupNumber(raw: string): string {
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? "" : body.slice(dot);
  return (negative ? "-" : "") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + rest;
}

function padDecimals(raw: string, decimals: number): string {
  if (!raw || raw === "-" || raw === "0.") raw = raw === "0." ? "0" : raw;
  if (!raw || raw === "-") return raw;
  const [whole, frac = ""] = raw.split(".");
  return frac.length >= decimals ? raw : `${whole}.${frac.padEnd(decimals, "0")}`;
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "name"> & {
  /** Omit when the value is kept in state and posted some other way. */
  name?: string;
  value?: string | number | null;
  defaultValue?: string | number | null;
  /** Receives the plain number as a string (no separators). */
  onValueChange?: (raw: string) => void;
  /** Pad to this many decimals when the field loses focus (e.g. 2 for money). */
  decimals?: number;
};

/**
 * Number field that shows thousands separators as you type (134,235,246.00)
 * but submits the plain number, so server actions keep parsing it as before.
 * The visible input carries no name; a hidden input posts the clean value.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, Props>(function NumberInput(
  { name, value, defaultValue, onValueChange, decimals, className, disabled, onBlur, ...rest }, forwardedRef,
) {
  const [state, setState] = React.useState(() => cleanNumber(defaultValue == null ? "" : String(defaultValue)));
  const raw = value !== undefined ? cleanNumber(value == null ? "" : String(value)) : state;
  const display = groupNumber(raw);

  const innerRef = React.useRef<HTMLInputElement | null>(null);
  const caret = React.useRef<number | null>(null);
  const setRefs = (el: HTMLInputElement | null) => {
    innerRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };

  const update = (next: string) => {
    if (value === undefined) setState(next);
    onValueChange?.(next);
  };

  // Put the caret back after the same number of digits, since commas shift it.
  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (caret.current == null || !el) return;
    let seen = 0;
    let i = 0;
    for (; i < el.value.length && seen < caret.current; i++) if (/[\d.\-]/.test(el.value[i])) seen++;
    el.setSelectionRange(i, i);
    caret.current = null;
  }, [display]);

  return (
    <>
      <input
        {...rest}
        ref={setRefs}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={display}
        onChange={(e) => {
          const el = e.target;
          const pos = el.selectionStart ?? el.value.length;
          caret.current = el.value.slice(0, pos).replace(/[^\d.\-]/g, "").length;
          update(cleanNumber(el.value));
        }}
        onBlur={(e) => {
          if (decimals != null && raw) update(padDecimals(raw, decimals));
          onBlur?.(e);
        }}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
      {name && <input type="hidden" name={name} value={raw} disabled={disabled} />}
    </>
  );
});
