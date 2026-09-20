"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/rbac";
import { codePrefix, nextCode, nextGlobalCode } from "@/lib/ids";
import { writeAudit, auditDiff } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";
import {
  CAPITAL_TXN_TYPES,
  CAPITAL_TXN_META,
  PAYMENT_METHODS,
  SHAREHOLDER_KINDS,
  type CapitalTxnType,
  type AccountSubtype,
} from "@/lib/enums";
import { postJournal, reverseJournal } from "@/lib/accounting";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const dec = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};
const date = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ─── Directors ──────────────────────────────────────────────────────────────

const createDirectorSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  joinedAt: z.date().nullable(),
  notes: z.string().nullable(),
});

export async function createDirector(fd: FormData) {
  const session = await requireCapability("director:write");
  const parsed = createDirectorSchema.parse({
    name: str(fd.get("name")) ?? "",
    role: str(fd.get("role")) ?? "Director",
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    nationalId: str(fd.get("nationalId")),
    address: str(fd.get("address")),
    joinedAt: date(fd.get("joinedAt")),
    notes: str(fd.get("notes")),
  });

  await prisma.$transaction(async (tx) => {
    const code = await nextGlobalCode(codePrefix.director, tx, { pad: 4 });
    const created = await tx.director.create({
      data: {
        code,
        name: parsed.name,
        role: parsed.role,
        email: parsed.email,
        phone: parsed.phone,
        nationalId: parsed.nationalId,
        address: parsed.address,
        joinedAt: parsed.joinedAt ?? new Date(),
        notes: parsed.notes,
      },
    });
    await writeAudit({
      entity: "Director", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.name} (${parsed.role})`,
    }, tx);
  });
  revalidatePath("/directors");
  revalidatePath("/capital");
  revalidatePath("/");
}

const updateDirectorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  active: z.boolean(),
  joinedAt: z.date().nullable(),
  leftAt: z.date().nullable(),
  notes: z.string().nullable(),
});

export async function updateDirector(fd: FormData) {
  const session = await requireCapability("director:write");
  const parsed = updateDirectorSchema.parse({
    id: str(fd.get("id")),
    name: str(fd.get("name")) ?? "",
    role: str(fd.get("role")) ?? "Director",
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    nationalId: str(fd.get("nationalId")),
    address: str(fd.get("address")),
    active: str(fd.get("active")) === "true",
    joinedAt: date(fd.get("joinedAt")),
    leftAt: date(fd.get("leftAt")),
    notes: str(fd.get("notes")),
  });

  await prisma.$transaction(async (tx) => {
    const before = await tx.director.findUniqueOrThrow({ where: { id: parsed.id } });
    const after = await tx.director.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        role: parsed.role,
        email: parsed.email,
        phone: parsed.phone,
        nationalId: parsed.nationalId,
        address: parsed.address,
        active: parsed.active,
        joinedAt: parsed.joinedAt ?? before.joinedAt,
        leftAt: parsed.leftAt,
        notes: parsed.notes,
      },
    });
    await auditDiff(
      {
        entity: "Director", entityId: parsed.id, entityCode: before.code,
        userId: session.user.id, userName: session.user.name ?? null,
      },
      { name: before.name, role: before.role, email: before.email, phone: before.phone,
        active: before.active, notes: before.notes },
      { name: after.name,  role: after.role,  email: after.email,  phone: after.phone,
        active: after.active,  notes: after.notes },
      ["name", "role", "email", "phone", "active", "notes"],
      tx,
    );
  });
  revalidatePath("/directors");
  revalidatePath(`/directors/${parsed.id}`);
}

// ─── Shareholders ───────────────────────────────────────────────────────────

const createShareholderSchema = z.object({
  kind: z.enum(SHAREHOLDER_KINDS),
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  directorId: z.string().nullable(),   // null = not also a director
  notes: z.string().nullable(),
});

export async function createShareholder(fd: FormData) {
  const session = await requireCapability("shareholder:write");
  const parsed = createShareholderSchema.parse({
    kind: str(fd.get("kind")) ?? "INDIVIDUAL",
    name: str(fd.get("name")) ?? "",
    email: str(fd.get("email")),
    phone: str(fd.get("phone")),
    nationalId: str(fd.get("nationalId")),
    address: str(fd.get("address")),
    directorId: str(fd.get("directorId")),
    notes: str(fd.get("notes")),
  });

  await prisma.$transaction(async (tx) => {
    const code = await nextGlobalCode(codePrefix.shareholder, tx, { pad: 4 });
    const created = await tx.shareholder.create({
      data: {
        code,
        kind: parsed.kind,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        nationalId: parsed.nationalId,
        address: parsed.address,
        directorId: parsed.directorId,
        notes: parsed.notes,
      },
    });
    await writeAudit({
      entity: "Shareholder", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.name} (${parsed.kind})`,
    }, tx);
  });
  revalidatePath("/shareholders");
  revalidatePath("/capital");
}

// ─── Share classes ──────────────────────────────────────────────────────────

const createShareClassSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  faceValue: z.number().positive(),
  currency: z.string(),
  notes: z.string().nullable(),
});

export async function createShareClass(fd: FormData) {
  const session = await requireCapability("shareholder:write");
  const parsed = createShareClassSchema.parse({
    code: str(fd.get("code"))?.toUpperCase() ?? "",
    name: str(fd.get("name")) ?? "",
    faceValue: dec(fd.get("faceValue")),
    currency: str(fd.get("currency")) ?? "LKR",
    notes: str(fd.get("notes")),
  });
  await prisma.$transaction(async (tx) => {
    const created = await tx.shareClass.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        faceValue: parsed.faceValue,
        currency: parsed.currency,
        notes: parsed.notes,
      },
    });
    await writeAudit({
      entity: "ShareClass", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.code}: ${parsed.name} @ ${parsed.faceValue} ${parsed.currency}`,
    }, tx);
  });
  revalidatePath("/shareholders");
}

// ─── Share transactions (append-only) ───────────────────────────────────────

const issueSharesSchema = z.object({
  shareClassId: z.string().min(1),
  transfereeId: z.string().min(1),      // shareholder receiving the issue
  numberOfShares: z.number().positive(),
  pricePerShare: z.number().nonnegative(),  // may equal face value
  transactionDate: z.date().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createCapitalTxn: z.boolean(),        // also record the money coming in?
  method: z.enum(PAYMENT_METHODS).nullable(),
});

/**
 * Issue new shares to a shareholder. Optionally records a paired
 * SHARE_CAPITAL CapitalTransaction so the money and the shares stay linked.
 * Updates the ShareLot atomically.
 */
export async function issueShares(fd: FormData) {
  const session = await requireCapability("shareholder:write");
  const parsed = issueSharesSchema.parse({
    shareClassId: str(fd.get("shareClassId")),
    transfereeId: str(fd.get("transfereeId")),
    numberOfShares: dec(fd.get("numberOfShares")),
    pricePerShare: dec(fd.get("pricePerShare")),
    transactionDate: date(fd.get("transactionDate")),
    reference: str(fd.get("reference")),
    notes: str(fd.get("notes")),
    createCapitalTxn: str(fd.get("createCapitalTxn")) === "true",
    method: str(fd.get("method")) as z.infer<typeof issueSharesSchema>["method"],
  });

  const documentFile = fd.get("documentFile") as File | null;
  const document = await saveUpload(documentFile, "share-transactions");

  const total = parsed.numberOfShares * parsed.pricePerShare;
  const when = parsed.transactionDate ?? new Date();
  const year = when.getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    const shareClass = await tx.shareClass.findUniqueOrThrow({ where: { id: parsed.shareClassId } });
    const shareholder = await tx.shareholder.findUniqueOrThrow({ where: { id: parsed.transfereeId } });

    let capitalTransactionId: string | null = null;
    if (parsed.createCapitalTxn) {
      const ctCode = await nextCode(codePrefix.capitalTxn, year, tx, { pad: 4 });
      const ct = await tx.capitalTransaction.create({
        data: {
          code: ctCode,
          type: "SHARE_CAPITAL",
          shareholderId: shareholder.id,
          amount: total,
          currency: shareClass.currency,
          method: parsed.method ?? "BANK_TRANSFER",
          reference: parsed.reference,
          transactionDate: when,
          notes: parsed.notes,
          recordedBy: session.user.name ?? null,
          status: "POSTED",
          postedAt: new Date(),
          postedBy: session.user.name ?? null,
        },
      });
      capitalTransactionId = ct.id;
      await writeAudit({
        entity: "CapitalTransaction", entityId: ct.id, entityCode: ct.code,
        action: "CREATE",
        userId: session.user.id, userName: session.user.name ?? null,
        newValue: `SHARE_CAPITAL · ${shareholder.name} · ${total.toFixed(2)} ${shareClass.currency}`,
      }, tx);
      await autoPostCapitalJournal({
        tx, ct, party: shareholder,
        postedBy: session.user.name ?? null, userId: session.user.id,
      });
    }

    const stCode = await nextCode(codePrefix.shareTxn, year, tx, { pad: 4 });
    const st = await tx.shareTransaction.create({
      data: {
        code: stCode,
        type: "SHARE_ISSUE",
        shareClassId: shareClass.id,
        numberOfShares: parsed.numberOfShares,
        pricePerShare: parsed.pricePerShare,
        totalAmount: total,
        currency: shareClass.currency,
        transfereeId: shareholder.id,
        transactionDate: when,
        reference: parsed.reference,
        documentUrl: document?.url ?? null,
        notes: parsed.notes,
        recordedBy: session.user.name ?? null,
        capitalTransactionId,
      },
    });

    await upsertLot(tx, shareholder.id, shareClass.id, parsed.numberOfShares, total);

    await writeAudit({
      entity: "ShareTransaction", entityId: st.id, entityCode: st.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `ISSUE ${parsed.numberOfShares} ${shareClass.code} → ${shareholder.name}`,
      metadata: { capitalTransactionId },
    }, tx);
  });
  revalidatePath("/shareholders");
  revalidatePath("/capital");
  revalidatePath("/");
}

const transferSharesSchema = z.object({
  shareClassId: z.string().min(1),
  transferorId: z.string().min(1),
  transfereeId: z.string().min(1),
  numberOfShares: z.number().positive(),
  pricePerShare: z.number().nonnegative(),
  transactionDate: z.date().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
});

export async function transferShares(fd: FormData) {
  const session = await requireCapability("shareholder:write");
  const parsed = transferSharesSchema.parse({
    shareClassId: str(fd.get("shareClassId")),
    transferorId: str(fd.get("transferorId")),
    transfereeId: str(fd.get("transfereeId")),
    numberOfShares: dec(fd.get("numberOfShares")),
    pricePerShare: dec(fd.get("pricePerShare")),
    transactionDate: date(fd.get("transactionDate")),
    reference: str(fd.get("reference")),
    notes: str(fd.get("notes")),
  });
  if (parsed.transferorId === parsed.transfereeId) {
    throw new Error("Transferor and transferee must be different shareholders.");
  }
  const documentFile = fd.get("documentFile") as File | null;
  const document = await saveUpload(documentFile, "share-transactions");
  const total = parsed.numberOfShares * parsed.pricePerShare;
  const when = parsed.transactionDate ?? new Date();
  const year = when.getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    const shareClass = await tx.shareClass.findUniqueOrThrow({ where: { id: parsed.shareClassId } });
    const from = await tx.shareholder.findUniqueOrThrow({ where: { id: parsed.transferorId } });
    const to   = await tx.shareholder.findUniqueOrThrow({ where: { id: parsed.transfereeId } });

    const fromLot = await tx.shareLot.findUnique({
      where: { shareholderId_shareClassId: { shareholderId: from.id, shareClassId: shareClass.id } },
    });
    if (!fromLot || Number(fromLot.numberOfShares) < parsed.numberOfShares) {
      throw new Error(`${from.name} does not hold ${parsed.numberOfShares} ${shareClass.code} shares.`);
    }
    // Paid-up transfers proportionally with the shares moved.
    const paidUpMoved = Number(fromLot.paidUpAmount) *
      (parsed.numberOfShares / Number(fromLot.numberOfShares));

    const stCode = await nextCode(codePrefix.shareTxn, year, tx, { pad: 4 });
    const st = await tx.shareTransaction.create({
      data: {
        code: stCode,
        type: "SHARE_TRANSFER",
        shareClassId: shareClass.id,
        numberOfShares: parsed.numberOfShares,
        pricePerShare: parsed.pricePerShare,
        totalAmount: total,
        currency: shareClass.currency,
        transferorId: from.id,
        transfereeId: to.id,
        transactionDate: when,
        reference: parsed.reference,
        documentUrl: document?.url ?? null,
        notes: parsed.notes,
        recordedBy: session.user.name ?? null,
      },
    });

    await upsertLot(tx, from.id, shareClass.id, -parsed.numberOfShares, -paidUpMoved);
    await upsertLot(tx, to.id,   shareClass.id,  parsed.numberOfShares,  paidUpMoved);

    await writeAudit({
      entity: "ShareTransaction", entityId: st.id, entityCode: st.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `TRANSFER ${parsed.numberOfShares} ${shareClass.code} · ${from.name} → ${to.name} @ ${parsed.pricePerShare}`,
    }, tx);
  });
  revalidatePath("/shareholders");
  revalidatePath("/capital");
}

const cancelSharesSchema = z.object({
  shareClassId: z.string().min(1),
  transferorId: z.string().min(1),
  numberOfShares: z.number().positive(),
  transactionDate: z.date().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
});

export async function cancelShares(fd: FormData) {
  const session = await requireCapability("shareholder:write");
  const parsed = cancelSharesSchema.parse({
    shareClassId: str(fd.get("shareClassId")),
    transferorId: str(fd.get("transferorId")),
    numberOfShares: dec(fd.get("numberOfShares")),
    transactionDate: date(fd.get("transactionDate")),
    reference: str(fd.get("reference")),
    notes: str(fd.get("notes")),
  });
  const when = parsed.transactionDate ?? new Date();
  const year = when.getUTCFullYear();
  await prisma.$transaction(async (tx) => {
    const shareClass = await tx.shareClass.findUniqueOrThrow({ where: { id: parsed.shareClassId } });
    const from = await tx.shareholder.findUniqueOrThrow({ where: { id: parsed.transferorId } });
    const fromLot = await tx.shareLot.findUnique({
      where: { shareholderId_shareClassId: { shareholderId: from.id, shareClassId: shareClass.id } },
    });
    if (!fromLot || Number(fromLot.numberOfShares) < parsed.numberOfShares) {
      throw new Error(`${from.name} does not hold ${parsed.numberOfShares} ${shareClass.code} shares.`);
    }
    const paidUpMoved = Number(fromLot.paidUpAmount) *
      (parsed.numberOfShares / Number(fromLot.numberOfShares));

    const code = await nextCode(codePrefix.shareTxn, year, tx, { pad: 4 });
    const st = await tx.shareTransaction.create({
      data: {
        code,
        type: "SHARE_CANCEL",
        shareClassId: shareClass.id,
        numberOfShares: parsed.numberOfShares,
        pricePerShare: 0,
        totalAmount: 0,
        currency: shareClass.currency,
        transferorId: from.id,
        transactionDate: when,
        reference: parsed.reference,
        notes: parsed.notes,
        recordedBy: session.user.name ?? null,
      },
    });
    await upsertLot(tx, from.id, shareClass.id, -parsed.numberOfShares, -paidUpMoved);
    await writeAudit({
      entity: "ShareTransaction", entityId: st.id, entityCode: st.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `CANCEL ${parsed.numberOfShares} ${shareClass.code} · ${from.name}`,
    }, tx);
  });
  revalidatePath("/shareholders");
  revalidatePath("/capital");
}

async function upsertLot(
  tx: Prisma.TransactionClient,
  shareholderId: string,
  shareClassId: string,
  deltaShares: number,
  deltaPaidUp: number,
) {
  const existing = await tx.shareLot.findUnique({
    where: { shareholderId_shareClassId: { shareholderId, shareClassId } },
  });
  if (!existing) {
    if (deltaShares < 0) throw new Error("Cannot remove shares from a non-existent lot.");
    await tx.shareLot.create({
      data: { shareholderId, shareClassId, numberOfShares: deltaShares, paidUpAmount: Math.max(0, deltaPaidUp) },
    });
    return;
  }
  const nextShares = Number(existing.numberOfShares) + deltaShares;
  const nextPaidUp = Math.max(0, Number(existing.paidUpAmount) + deltaPaidUp);
  if (nextShares < 0) throw new Error("Lot balance would go negative.");
  await tx.shareLot.update({
    where: { shareholderId_shareClassId: { shareholderId, shareClassId } },
    data: { numberOfShares: nextShares, paidUpAmount: nextPaidUp },
  });
}

// ─── Capital transactions (non-share money movement) ────────────────────────

const capitalTxnSchema = z.object({
  type: z.enum(CAPITAL_TXN_TYPES),
  directorId: z.string().nullable(),
  shareholderId: z.string().nullable(),
  amount: z.number().positive(),
  currency: z.string(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  transactionDate: z.date().nullable(),
  notes: z.string().nullable(),
});

/**
 * Record a non-share capital movement. For SHARE_CAPITAL you should use
 * issueShares() with createCapitalTxn:true — this action refuses that type
 * so the two sides never drift apart.
 */
export async function recordCapitalTransaction(fd: FormData) {
  const session = await requireCapability("capital:write");
  const parsed = capitalTxnSchema.parse({
    type: str(fd.get("type")),
    directorId: str(fd.get("directorId")),
    shareholderId: str(fd.get("shareholderId")),
    amount: dec(fd.get("amount")),
    currency: str(fd.get("currency")) ?? "LKR",
    method: str(fd.get("method")) ?? "BANK_TRANSFER",
    reference: str(fd.get("reference")),
    transactionDate: date(fd.get("transactionDate")),
    notes: str(fd.get("notes")),
  });
  if (parsed.type === "SHARE_CAPITAL") {
    throw new Error("Use the share-issue action to record share capital — it pairs the money with the share transaction.");
  }
  const meta = CAPITAL_TXN_META[parsed.type];
  if (meta.party === "director" && !parsed.directorId) {
    throw new Error(`${meta.label} requires a director to be selected.`);
  }
  if (meta.party === "shareholder" && !parsed.shareholderId) {
    throw new Error(`${meta.label} requires a shareholder to be selected.`);
  }

  const receiptFile = fd.get("receiptFile") as File | null;
  const receipt = await saveUpload(receiptFile, "capital");
  const when = parsed.transactionDate ?? new Date();
  const year = when.getUTCFullYear();

  await prisma.$transaction(async (tx) => {
    const code = await nextCode(codePrefix.capitalTxn, year, tx, { pad: 4 });
    const party = parsed.directorId
      ? await tx.director.findUniqueOrThrow({ where: { id: parsed.directorId }, select: { name: true, code: true } })
      : await tx.shareholder.findUniqueOrThrow({ where: { id: parsed.shareholderId! }, select: { name: true, code: true } });
    const created = await tx.capitalTransaction.create({
      data: {
        code,
        type: parsed.type,
        directorId: meta.party === "director" ? parsed.directorId : null,
        shareholderId: meta.party === "shareholder" ? parsed.shareholderId : null,
        amount: parsed.amount,
        currency: parsed.currency,
        method: parsed.method,
        reference: parsed.reference,
        transactionDate: when,
        receiptUrl: receipt?.url ?? null,
        notes: parsed.notes,
        recordedBy: session.user.name ?? null,
        status: "POSTED",
        postedAt: new Date(),
        postedBy: session.user.name ?? null,
      },
    });
    await writeAudit({
      entity: "CapitalTransaction", entityId: created.id, entityCode: created.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `${parsed.type} · ${party.name} · ${parsed.amount.toFixed(2)} ${parsed.currency}`,
      metadata: { partyCode: party.code },
    }, tx);
    await autoPostCapitalJournal({
      tx, ct: created, party,
      postedBy: session.user.name ?? null, userId: session.user.id,
    });
  });
  revalidatePath("/capital");
  revalidatePath("/directors");
  revalidatePath("/shareholders");
  revalidatePath("/journals");
  revalidatePath("/reports/trial-balance");
  revalidatePath("/");
}

const reverseSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * Post a reversing entry against a previously POSTED capital transaction.
 * Never edits the original — the audit trail preserves both rows and the
 * reversalOf link makes them navigable.
 */
export async function reverseCapitalTransaction(fd: FormData) {
  const session = await requireCapability("capital:write");
  const parsed = reverseSchema.parse({
    id: str(fd.get("id")),
    reason: str(fd.get("reason")) ?? "",
  });
  await prisma.$transaction(async (tx) => {
    const original = await tx.capitalTransaction.findUniqueOrThrow({ where: { id: parsed.id } });
    if (original.status !== "POSTED") {
      throw new Error(`Cannot reverse a transaction in status ${original.status}.`);
    }
    if (original.type === "SHARE_CAPITAL") {
      throw new Error("Share-capital reversals must be done through a matching share cancel/return — not implemented in this phase.");
    }
    const year = new Date().getUTCFullYear();
    const code = await nextCode(codePrefix.capitalTxn, year, tx, { pad: 4 });
    const reversal = await tx.capitalTransaction.create({
      data: {
        code,
        // The reversal keeps the same type so ledger rollups still net correctly
        // when we sum signed values by type.
        type: original.type,
        directorId: original.directorId,
        shareholderId: original.shareholderId,
        amount: Prisma.Decimal.mul(original.amount, -1),
        currency: original.currency,
        method: original.method,
        reference: `Reversal of ${original.code}`,
        transactionDate: new Date(),
        notes: parsed.reason,
        recordedBy: session.user.name ?? null,
        status: "POSTED",
        postedAt: new Date(),
        postedBy: session.user.name ?? null,
        reversalOfId: original.id,
      },
    });
    await tx.capitalTransaction.update({
      where: { id: original.id },
      data: { status: "REVERSED" },
    });
    await writeAudit({
      entity: "CapitalTransaction", entityId: original.id, entityCode: original.code,
      action: "REVERSE",
      userId: session.user.id, userName: session.user.name ?? null,
      oldValue: "POSTED", newValue: "REVERSED",
      metadata: { reversalCode: reversal.code, reason: parsed.reason },
    }, tx);
    await writeAudit({
      entity: "CapitalTransaction", entityId: reversal.id, entityCode: reversal.code,
      action: "CREATE",
      userId: session.user.id, userName: session.user.name ?? null,
      newValue: `Reversal of ${original.code}: ${parsed.reason}`,
    }, tx);
    // Reverse the linked journal (if the original was auto-posted) and
    // link the reversing CapitalTransaction to the reversing Journal.
    if (original.journalId) {
      const revJ = await reverseJournal(original.journalId, parsed.reason, session.user.name ?? null, tx);
      await tx.capitalTransaction.update({
        where: { id: reversal.id },
        data: { journalId: revJ.id },
      });
    }
  });
  revalidatePath("/capital");
  revalidatePath("/directors");
  revalidatePath("/shareholders");
  revalidatePath("/journals");
  revalidatePath("/reports/trial-balance");
}

// ─── Auto-post CapitalTransaction → Journal ─────────────────────────────────

/**
 * Which CoA subtypes to debit and credit for each capital-transaction type.
 * The company account (bank) is always the counterparty for cash-side
 * entries. Non-LKR entries are skipped for now — we'll wire FX later.
 * `null` means "don't auto-post" (users can still enter the journal by hand).
 */
const CAPITAL_JOURNAL_MAP: Record<CapitalTxnType, { debit: AccountSubtype; credit: AccountSubtype } | null> = {
  SHARE_CAPITAL:          { debit: "BANK",          credit: "SHARE_CAPITAL"    },
  DIRECTOR_LOAN:          { debit: "BANK",          credit: "DIRECTOR_LOAN"    },
  LOAN_REPAY:             { debit: "DIRECTOR_LOAN", credit: "BANK"             },
  ADVANCE:                { debit: "BANK",          credit: "DIRECTOR_LOAN"    },
  ADVANCE_REPAY:          { debit: "DIRECTOR_LOAN", credit: "BANK"             },
  WITHDRAWAL:             { debit: "DIRECTOR_LOAN", credit: "BANK"             },
  DIVIDEND:               { debit: "RETAINED_EARNINGS", credit: "BANK"         },
  EXPENSE_PAID_ON_BEHALF: null, // Needs an expense subtype — user picks manually.
};

async function autoPostCapitalJournal(args: {
  tx: Prisma.TransactionClient;
  ct: {
    id: string; code: string; type: string; amount: Prisma.Decimal | number;
    currency: string; transactionDate: Date; reference: string | null;
    notes?: string | null;
  };
  party: { name: string; code: string };
  postedBy: string | null;
  userId: string;
}) {
  const { tx, ct, party, postedBy, userId } = args;
  if (ct.currency !== "LKR") return;                     // FX later
  const mapping = CAPITAL_JOURNAL_MAP[ct.type as CapitalTxnType];
  if (!mapping) return;
  // Check that both target accounts exist. If they don't, the CoA hasn't
  // been seeded — skip auto-posting rather than failing the whole tx.
  const missing = await Promise.all([mapping.debit, mapping.credit].map(async (s) => {
    const acct = await tx.chartAccount.findFirst({ where: { subtype: s, isActive: true } });
    return acct ? null : s;
  }));
  if (missing.some((m) => m !== null)) return;

  const amount = Number(ct.amount);
  const journal = await postJournal({
    transactionDate: ct.transactionDate,
    description: `${ct.type} · ${party.name} · ${ct.code}`,
    reference: ct.reference,
    currency: ct.currency,
    sourceModule: "CAPITAL",
    sourceId: ct.id,
    sourceCode: ct.code,
    postedBy,
    lines: [
      { subtype: mapping.debit,  debit: amount,  description: `${party.name} · ${party.code}` },
      { subtype: mapping.credit, credit: amount, description: `${party.name} · ${party.code}` },
    ],
  }, tx);
  await tx.capitalTransaction.update({
    where: { id: ct.id },
    data: { journalId: journal.id },
  });
  await writeAudit({
    entity: "Journal", entityId: journal.id, entityCode: journal.code,
    action: "POST",
    userId, userName: postedBy,
    newValue: `Auto-posted from ${ct.code}`,
    metadata: { sourceModule: "CAPITAL", sourceCode: ct.code },
  }, tx);
}
