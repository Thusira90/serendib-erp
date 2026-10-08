"use server";

import { verifyPasswordAndUnlock } from "@/lib/partner-access";

const MESSAGES: Record<string, string> = {
  BAD_PASSWORD: "That password is not right.",
  LOCKED: "Too many wrong attempts. Please wait a while and try again.",
  RATE_LIMITED: "Too many attempts. Please wait a while and try again.",
};

// Every failure that is not a wrong password reads the same, so the reply never says whether the link exists.
export async function verifyPartnerPassword(
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof token !== "string" || typeof password !== "string") return { ok: false, error: "This link is not available." };
  const res = await verifyPasswordAndUnlock(token, password);
  if (res.ok) return res;
  return { ok: false, error: MESSAGES[res.error] ?? "This link is not available." };
}
