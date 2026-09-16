"use client";

import * as React from "react";
import { CURRENCIES, BASE_CURRENCY } from "@/lib/enums";
import { useExchangeRates } from "@/lib/use-exchange-rates";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Amount + currency picker + live-rate hint.
 *
 * Renders two form fields:
 *   - <input name={amountName}>    — the numeric amount (`inputMode="decimal"`)
 *   - <select name={currencyName}> — the ISO currency code
 *
 * When the selected currency is NOT the base (LKR), a small hint appears
 * below the row showing the equivalent value in LKR at the current live rate,
 * plus "1 <ccy> = N LKR" and the age of the rate.
 *
 * Server actions read `amountName` and `currencyName` from FormData just like
 * a plain <Input> — no schema changes needed on the receiving end.
 */
export function CurrencyInput({
  amountName,
  currencyName,
  defaultAmount,
  defaultCurrency,
  value,
  onAmountChange,
  currency: currencyProp,
  onCurrencyChange,
  baseCurrency = BASE_CURRENCY,
  required = false,
  placeholder,
  size = "md",
  className,
  showBaseHint = true,
  amountId,
  disabled = false,
}: {
  amountName: string;
  currencyName: string;
  defaultAmount?: string | number | null;
  defaultCurrency?: string | null;
  /** Controlled-mode amount (as a string). Pair with `onAmountChange`. */
  value?: string;
  onAmountChange?: (v: string) => void;
  /** Controlled-mode currency code. Pair with `onCurrencyChange`. */
  currency?: string;
  onCurrencyChange?: (v: string) => void;
  baseCurrency?: string;
  required?: boolean;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  showBaseHint?: boolean;
  amountId?: string;
  disabled?: boolean;
}) {
  const initialAmount =
    defaultAmount == null || defaultAmount === "" ? "" : String(defaultAmount);
  const initialCurrency = (defaultCurrency ?? baseCurrency).toUpperCase();

  const [amountState, setAmountState] = React.useState(initialAmount);
  const [currencyState, setCurrencyState] = React.useState(initialCurrency);
  const amount = value !== undefined ? value : amountState;
  const currency = currencyProp !== undefined ? currencyProp : currencyState;
  const setAmount = (v: string) => {
    if (value === undefined) setAmountState(v);
    onAmountChange?.(v);
  };
  const setCurrency = (v: string) => {
    if (currencyProp === undefined) setCurrencyState(v);
    onCurrencyChange?.(v);
  };
  const { rates, loading, error } = useExchangeRates();

  const heightCls = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";
  const numeric = parseFloat(amount);
  const hasAmount = amount !== "" && Number.isFinite(numeric);
  const isForeign = currency !== baseCurrency;

  // Convert amount into base currency for the hint.
  // `rates.perUnit[c]` = "1 c is worth N base units" — so we multiply.
  let convertedToBase: number | null = null;
  let perUnit: number | null = null;
  if (rates && rates.perUnit[currency] != null) {
    perUnit = rates.perUnit[currency];
    if (hasAmount) convertedToBase = numeric * perUnit;
  }

  // Also compute the base-currency amount → foreign hint direction is rarer,
  // but skip it: showing "≈ LKR ..." for a LKR amount is noise.

  const hintVisible = showBaseHint && isForeign;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-stretch">
        <input
          type="text"
          inputMode="decimal"
          id={amountId}
          name={amountName}
          required={required}
          placeholder={placeholder}
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(e.target.value)}
          className={cn(
            "flex w-full rounded-md rounded-r-none border border-input bg-background px-3 py-1 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            heightCls,
          )}
        />
        <select
          name={currencyName}
          value={currency}
          disabled={disabled}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label="Currency"
          className={cn(
            "shrink-0 rounded-md rounded-l-none border border-l-0 border-input bg-secondary/40 px-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            heightCls,
          )}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
      </div>

      {hintVisible && (
        <div className="text-[10px] leading-tight text-muted-foreground">
          <RateHint
            loading={loading}
            error={error}
            perUnit={perUnit}
            convertedToBase={convertedToBase}
            hasAmount={hasAmount}
            currency={currency}
            baseCurrency={baseCurrency}
            stale={rates?.source === "fallback"}
          />
        </div>
      )}
    </div>
  );
}

function RateHint({
  loading, error, perUnit, convertedToBase, hasAmount, currency, baseCurrency, stale,
}: {
  loading: boolean;
  error: string | null;
  perUnit: number | null;
  convertedToBase: number | null;
  hasAmount: boolean;
  currency: string;
  baseCurrency: string;
  stale: boolean;
}) {
  if (loading && perUnit == null) return <>Fetching live rate…</>;
  if (perUnit == null) {
    return (
      <span className="text-amber-700">
        Live rate unavailable{error ? ` (${error})` : ""} — the amount will be saved as {currency}.
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {hasAmount && convertedToBase != null && (
        <span className="font-medium text-foreground/80">
          ≈ {formatCurrency(convertedToBase, baseCurrency, { maximumFractionDigits: 0 })}
        </span>
      )}
      <span className="opacity-70">
        1 {currency} = {perUnit.toLocaleString(undefined, { maximumFractionDigits: 4 })} {baseCurrency}
      </span>
      {stale && <span className="text-amber-700">· cached rate</span>}
    </span>
  );
}

/**
 * Bare currency picker (no amount input). Handy for standalone "Default
 * currency" selects, e.g. in company settings.
 */
export function CurrencySelect({
  name, defaultValue, className, id,
}: {
  name: string;
  defaultValue?: string | null;
  className?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={(defaultValue ?? BASE_CURRENCY).toUpperCase()}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm",
        className,
      )}
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
