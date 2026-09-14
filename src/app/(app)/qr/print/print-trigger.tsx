"use client";

export function PrintTrigger() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs border rounded-md px-3 py-1.5 bg-card hover:bg-secondary"
    >
      Print
    </button>
  );
}
