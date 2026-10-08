import type { Capability } from "@/lib/rbac";

export type ShareScope = "CATALOGUE" | "GEMSTONE" | "GEMSTONES" | "COLLECTION" | "ROUGH" | "ROUGHS";

// Sharing sends stone data outside the company, so the creator needs the
// sharing capability AND permission to see the kind of stone being shared.
export const SCOPE_CAPS: Record<ShareScope, Capability[]> = {
  CATALOGUE: ["collection:write", "gemstone:read"],
  GEMSTONE: ["collection:write", "gemstone:read"],
  GEMSTONES: ["collection:write", "gemstone:read"],
  COLLECTION: ["collection:write", "gemstone:read"],
  ROUGH: ["collection:write", "rough:read"],
  ROUGHS: ["collection:write", "rough:read"],
};
