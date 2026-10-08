import "server-only";
import { getFieldVocabulary } from "@/lib/field-vocab";

/**
 * The choices offered for a customer's buying preferences: the starter lists
 * plus everything already used on stones, so the dropdowns match the stock.
 * Returned under plain keys (gemType, variety, origin, color, shape, treatment).
 */
export async function customerVocab(): Promise<Record<string, string[]>> {
  const v = await getFieldVocabulary([
    { model: "gemstone", field: "gemType" },
    { model: "roughStone", field: "gemType" },
    { model: "gemstone", field: "variety" },
    { model: "roughStone", field: "variety" },
    { model: "gemstone", field: "origin" },
    { model: "roughStone", field: "origin" },
    { model: "roughStone", field: "color", seedKey: "color" },
    { model: "gemstone", field: "shape" },
    { model: "roughStone", field: "shape" },
    { model: "gemstone", field: "treatment" },
    { model: "roughStone", field: "treatment" },
  ]);
  const merge = (...keys: string[]) =>
    Array.from(new Set(keys.flatMap((k) => v[k] ?? []))).sort((a, b) => a.localeCompare(b));
  return {
    gemType: merge("gemstone.gemType", "roughStone.gemType"),
    variety: merge("gemstone.variety", "roughStone.variety"),
    origin: merge("gemstone.origin", "roughStone.origin"),
    color: merge("roughStone.color"),
    shape: merge("gemstone.shape", "roughStone.shape"),
    treatment: merge("gemstone.treatment", "roughStone.treatment"),
  };
}
