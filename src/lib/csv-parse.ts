/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields, escaped quotes (""),
 * embedded commas and newlines. Returns rows as arrays of raw string cells.
 * Trailing empty lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/\r\n?/g, "\n"); // normalize line endings

  const pushField = () => {
    cur.push(field);
    field = "";
  };
  const pushRow = () => {
    // skip completely-blank rows
    if (cur.length === 1 && cur[0] === "") {
      cur = [];
      return;
    }
    rows.push(cur);
    cur = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // flush the last field/row
  if (field.length > 0 || cur.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

/**
 * Parse CSV into an array of objects keyed by header row. Empty strings
 * become null so downstream Zod schemas can treat missing = optional cleanly.
 */
export function parseCsvToObjects(text: string): Array<Record<string, string | null>> {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string | null> = {};
    headers.forEach((h, i) => {
      const raw = row[i] ?? "";
      obj[h] = raw === "" ? null : raw;
    });
    return obj;
  });
}
