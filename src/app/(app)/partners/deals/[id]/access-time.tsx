"use client";

import { useEffect, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

const utcText = (d: Date, dateOnly: boolean) => {
  const day = `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return dateOnly ? day : `${day}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

const localText = (d: Date, dateOnly: boolean) => {
  const day = `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return dateOnly ? day : `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Server and first client render both print UTC, so hydration always matches;
 * after mount the time switches to the viewer's own zone.
 */
export function AccessTime({ iso, dateOnly = false, empty = "—" }: { iso: string | null; dateOnly?: boolean; empty?: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => { setLocal(true); }, []);
  if (!iso) return <>{empty}</>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <>{empty}</>;
  return (
    <time dateTime={iso} title={utcText(d, false)}>
      {local ? localText(d, dateOnly) : utcText(d, dateOnly)}
    </time>
  );
}
