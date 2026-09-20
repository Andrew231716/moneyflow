import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenBankingHttpError } from "../auth";
import type { OpenBankingProvider } from "../provider";
import type { BankConnectionRow } from "../types";

const mockProvider: OpenBankingProvider = {
  id: "gocardless",
  getInstitutions: vi.fn(),
  createConnection: vi.fn(),
  getConnection: vi.fn(),
  getAccounts: vi.fn(),
  getAccountDetails: vi.fn(),
  getBalances: vi.fn(),
  getTransactions: vi.fn(),
  getAgreement: vi.fn(),
  deleteConnection: vi.fn(),
};

vi.mock("../factory", () => ({
  getOpenBankingProvider: () => mockProvider,
  resolveDefaultProviderId: () => "gocardless" as const,
}));

import {
  disconnectConnection,
  handleConnectionCallback,
  syncConnection,
} from "../service";

type Row = Record<string, unknown>;

function baseConnection(overrides: Partial<BankConnectionRow> = {}): BankConnectionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "user-a",
    provider: "gocardless",
    provider_connection_id: "req-a",
    institution_id: "INTESA_IT",
    institution_name: "Intesa Sanpaolo",
    institution_logo: null,
    status: "pending",
    consent_expires_at: null,
    last_synced_at: null,
    error_message: null,
    metadata: { reference: "mf_ref_a" },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Minimal chainable Supabase mock keyed by table.
 * Supports the query shapes used by open-banking service.
 */
function createSupabaseMock(state: {
  connections: BankConnectionRow[];
  bankAccounts: Row[];
  accounts: Row[];
  transactions: Row[];
  failUpdates?: Set<string>;
  failSelects?: Set<string>;
  failInserts?: Set<string>;
}) {
  const filters: Record<string, unknown> = {};
  let table = "";
  let mode: "select" | "update" | "insert" = "select";
  let payload: Row | null = null;
  let preferSingle = false;
  let preferMaybe = false;

  const api = {
    from(name: string) {
      table = name;
      mode = "select";
      payload = null;
      preferSingle = false;
      preferMaybe = false;
      for (const k of Object.keys(filters)) delete filters[k];
      return api;
    },
    select(_cols?: string) {
      void _cols;
      mode = mode === "update" || mode === "insert" ? mode : "select";
      return api;
    },
    insert(row: Row) {
      mode = "insert";
      payload = row;
      return api;
    },
    update(row: Row) {
      mode = "update";
      payload = row;
      return api;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return api;
    },
    in(col: string, vals: unknown[]) {
      filters[`${col}__in`] = vals;
      return api;
    },
    gte(col: string, val: unknown) {
      filters[`${col}__gte`] = val;
      return api;
    },
    neq(col: string, val: unknown) {
      filters[`${col}__neq`] = val;
      return api;
    },
    not(col: string, op: string, val?: unknown) {
      if (op === "is" && (val === null || val === undefined)) {
        filters[`${col}__notnull`] = true;
      }
      return api;
    },
    order() {
      return api;
    },
    limit(n?: number) {
      if (typeof n === "number") filters.__limit = n;
      return api;
    },
    single() {
      preferSingle = true;
      return api.then();
    },
    maybeSingle() {
      preferMaybe = true;
      return api.then();
    },
    then(resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };

  function matchRows(rows: Row[]): Row[] {
    let matched = rows.filter((row) => {
      for (const [k, v] of Object.entries(filters)) {
        if (k === "__limit") continue;
        if (k.endsWith("__in")) {
          const col = k.replace(/__in$/, "");
          if (!(v as unknown[]).includes(row[col])) return false;
        } else if (k.endsWith("__gte")) {
          const col = k.replace(/__gte$/, "");
          if (String(row[col]) < String(v)) return false;
        } else if (k.endsWith("__neq")) {
          const col = k.replace(/__neq$/, "");
          if (row[col] === v) return false;
        } else if (k.endsWith("__notnull")) {
          const col = k.replace(/__notnull$/, "");
          if (row[col] == null) return false;
        } else if (k === "metadata->>reference") {
          const meta = row.metadata as { reference?: string } | undefined;
          if (meta?.reference !== v) return false;
        } else if (row[k] !== v) {
          return false;
        }
      }
      return true;
    });
    const limit = filters.__limit;
    if (typeof limit === "number") matched = matched.slice(0, limit);
    return matched;
  }

  function run(): { data: unknown; error: { message: string; code?: string } | null } {
    if (state.failSelects?.has(table) && mode === "select") {
      return { data: null, error: { message: "select failed" } };
    }
    if (state.failUpdates?.has(table) && mode === "update") {
      return { data: null, error: { message: "update failed" } };
    }
    if (state.failInserts?.has(table) && mode === "insert") {
      return { data: null, error: { message: "insert failed", code: "23505" } };
    }

    if (table === "bank_connections") {
      if (mode === "select") {
        const matched = matchRows(state.connections as unknown as Row[]);
        if (preferMaybe || preferSingle) {
          return { data: matched[0] ?? null, error: null };
        }
        return { data: matched, error: null };
      }
      if (mode === "update") {
        const matched = matchRows(state.connections as unknown as Row[]);
        const row = matched[0];
        if (!row) return { data: null, error: { message: "not found" } };
        Object.assign(row, payload);
        return { data: preferSingle || preferMaybe ? row : [row], error: null };
      }
    }

    if (table === "bank_accounts") {
      if (mode === "select") {
        const matched = matchRows(state.bankAccounts);
        if (preferMaybe || preferSingle) {
          return { data: matched[0] ?? null, error: null };
        }
        return { data: matched, error: null };
      }
      if (mode === "insert") {
        const row = { id: `ba-${state.bankAccounts.length + 1}`, ...payload };
        state.bankAccounts.push(row);
        return { data: preferSingle ? row : [row], error: null };
      }
      if (mode === "update") {
        const matched = matchRows(state.bankAccounts);
        const row = matched[0];
        if (!row) return { data: null, error: { message: "not found" } };
        Object.assign(row, payload);
        return { data: row, error: null };
      }
    }

    if (table === "accounts") {
      if (mode === "select") {
        const matched = matchRows(state.accounts);
        if (preferMaybe || preferSingle) {
          return { data: matched[0] ?? null, error: null };
        }
        return { data: matched, error: null };
      }
      if (mode === "insert") {
        const row = { id: `acc-${state.accounts.length + 1}`, ...payload };
        state.accounts.push(row);
        return { data: preferSingle ? row : [row], error: null };
      }
      if (mode === "update") {
        const matched = matchRows(state.accounts);
        const row = matched[0];
        if (!row) return { data: null, error: { message: "not found" } };
        Object.assign(row, payload);
        return { data: row, error: null };
      }
    }

    if (table === "transactions") {
      if (mode === "select") {
        const matched = matchRows(state.transactions);
        return { data: matched, error: null };
      }
      if (mode === "insert") {
        if (state.failInserts?.has("transactions_dup")) {
          return { data: null, error: { message: "dup", code: "23505" } };
        }
        if (state.failInserts?.has("transactions_other")) {
          return { data: null, error: { message: "db down", code: "57014" } };
        }
        const row = { id: `tx-${state.transactions.length + 1}`, ...payload };
        state.transactions.push(row);
        return { data: preferSingle ? { id: row.id } : [row], error: null };
      }
      if (mode === "update") {
        const matched = matchRows(state.transactions);
        const row = matched[0];
        if (!row) return { data: null, error: { message: "not found" } };
        Object.assign(row, payload);
        return { data: row, error: null };
      }
    }

    return { data: null, error: null };
  }

  return api as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("handleConnectionCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the correct pending connection by reference among two concurrent ones", async () => {
    const a = baseConnection();
    const b = baseConnection({
      id: "22222222-2222-2222-2222-222222222222",
      provider_connection_id: "req-b",
      metadata: { reference: "mf_ref_b" },
      institution_name: "Other Bank",
    });
    const supabase = createSupabaseMock({
      connections: [a, b],
      bankAccounts: [],
      accounts: [],
      transactions: [],
    });

    vi.mocked(mockProvider.getConnection).mockResolvedValue({
      id: "req-a",
      status: "LN",
      institutionId: "INTESA_IT",
      accounts: ["pa-1"],
      agreement: "agr-1",
      reference: "mf_ref_a",
    });
    vi.mocked(mockProvider.getAccounts).mockResolvedValue([
      { id: "pa-1", iban: "IT60X0542811101000000123456", name: "Conto", currency: "EUR" },
    ]);
    vi.mocked(mockProvider.getAgreement!).mockResolvedValue({
      id: "agr-1",
      acceptedAt: "2026-09-01T00:00:00.000Z",
      accessValidForDays: 90,
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    vi.mocked(mockProvider.getBalances).mockResolvedValue([
      { amount: 10, currency: "EUR", type: "interimAvailable" },
    ]);
    vi.mocked(mockProvider.getTransactions).mockResolvedValue([]);

    const result = await handleConnectionCallback({
      supabase,
      userId: "user-a",
      ref: "mf_ref_a",
    });

    expect(result.connection.id).toBe(a.id);
    expect(result.connection.status).toBe("active");
    expect(result.connection.consent_expires_at).toBe("2026-11-30T00:00:00.000Z");
    expect(b.status).toBe("pending");
  });

  it("rejects unknown / missing reference without selecting another pending connection", async () => {
    const a = baseConnection();
    const b = baseConnection({
      id: "22222222-2222-2222-2222-222222222222",
      provider_connection_id: "req-b",
      metadata: { reference: "mf_ref_b" },
    });
    const supabase = createSupabaseMock({
      connections: [a, b],
      bankAccounts: [],
      accounts: [],
      transactions: [],
    });

    await expect(
      handleConnectionCallback({ supabase, userId: "user-a", ref: "mf_unknown" })
    ).rejects.toBeInstanceOf(OpenBankingHttpError);

    await expect(
      handleConnectionCallback({ supabase, userId: "user-a", ref: null })
    ).rejects.toBeInstanceOf(OpenBankingHttpError);

    expect(a.status).toBe("pending");
    expect(b.status).toBe("pending");
    expect(mockProvider.getConnection).not.toHaveBeenCalled();
  });

  it("rejects disconnected connections and enforces user isolation", async () => {
    const disconnected = baseConnection({ status: "disconnected" });
    const otherUser = baseConnection({
      id: "33333333-3333-3333-3333-333333333333",
      user_id: "user-b",
      metadata: { reference: "mf_ref_a" },
      provider_connection_id: "req-other",
    });
    const supabase = createSupabaseMock({
      connections: [disconnected, otherUser],
      bankAccounts: [],
      accounts: [],
      transactions: [],
    });

    await expect(
      handleConnectionCallback({
        supabase,
        userId: "user-a",
        ref: "mf_ref_a",
      })
    ).rejects.toMatchObject({ status: 404 });

    // Other user's identical reference must not be visible to user-a
    await expect(
      handleConnectionCallback({
        supabase,
        userId: "user-a",
        requisitionId: "req-other",
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("marks synced=false when post-activation sync reports errors", async () => {
    const a = baseConnection();
    const supabase = createSupabaseMock({
      connections: [a],
      bankAccounts: [],
      accounts: [],
      transactions: [],
    });
    vi.mocked(mockProvider.getConnection).mockResolvedValue({
      id: "req-a",
      status: "LN",
      institutionId: "INTESA_IT",
      accounts: ["pa-1"],
      agreement: null,
    });
    vi.mocked(mockProvider.getAccounts).mockResolvedValue([{ id: "pa-1" }]);
    vi.mocked(mockProvider.getBalances).mockRejectedValue(
      Object.assign(new Error("provider down"), { name: "GoCardlessApiError" })
    );
    vi.mocked(mockProvider.getTransactions).mockResolvedValue([]);

    const result = await handleConnectionCallback({
      supabase,
      userId: "user-a",
      ref: "mf_ref_a",
    });
    expect(result.connection.status).toBe("active");
    expect(result.synced).toBe(false);
  });
});

describe("syncConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-active / disconnected connections", async () => {
    const pending = baseConnection({ status: "pending" });
    const supabase = createSupabaseMock({
      connections: [pending],
      bankAccounts: [{ id: "ba-1", connection_id: pending.id, user_id: "user-a", provider_account_id: "pa-1", account_id: "acc-1", currency: "EUR" }],
      accounts: [],
      transactions: [],
    });
    await expect(
      syncConnection({ supabase, userId: "user-a", connectionId: pending.id })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("imports booked txs, dedups, and records non-unique DB insert errors", async () => {
    const active = baseConnection({ status: "active" });
    const state = {
      connections: [active],
      bankAccounts: [
        {
          id: "ba-1",
          connection_id: active.id,
          user_id: "user-a",
          provider_account_id: "pa-1",
          account_id: "acc-1",
          currency: "EUR",
        },
      ],
      accounts: [{ id: "acc-1", user_id: "user-a", balance: 0 }],
      transactions: [
        {
          id: "tx-existing",
          user_id: "user-a",
          bank_account_id: "ba-1",
          provider: "gocardless",
          provider_transaction_id: "dup-1",
          fingerprint: "fp-dup",
          category_id: null,
          description: "Old",
          merchant: null,
          notes: null,
          manual_override_fields: [],
          source: "bank",
          amount: 5,
          date: "2026-03-01",
          type: "expense",
          account_id: "acc-1",
        },
      ],
      failInserts: new Set<string>(),
    };
    const supabase = createSupabaseMock(state);

    vi.mocked(mockProvider.getBalances).mockResolvedValue([
      { amount: 100, currency: "EUR", type: "interimAvailable" },
    ]);
    vi.mocked(mockProvider.getTransactions).mockResolvedValue([
      {
        id: "dup-1",
        bookingDate: "2026-03-01",
        amount: -5,
        currency: "EUR",
        description: "Old",
      },
      {
        id: "new-1",
        bookingDate: "2026-03-02",
        amount: -12.5,
        currency: "EUR",
        description: "Coffee",
        merchantName: "Bar",
      },
    ]);

    const ok = await syncConnection({
      supabase,
      userId: "user-a",
      connectionId: active.id,
    });
    expect(ok.imported).toBe(1);
    expect(ok.skipped).toBeGreaterThanOrEqual(1);
    expect(ok.errors).toEqual([]);

    state.failInserts.add("transactions_other");
    vi.mocked(mockProvider.getTransactions).mockResolvedValue([
      {
        id: "new-2",
        bookingDate: "2026-03-03",
        amount: -3,
        currency: "EUR",
        description: "Snack",
      },
    ]);
    const partial = await syncConnection({
      supabase,
      userId: "user-a",
      connectionId: active.id,
    });
    expect(partial.errors.some((e) => e.includes("salvare"))).toBe(true);
  });

  it("surfaces provider timeout / unavailable as sync errors (not false success)", async () => {
    const active = baseConnection({ status: "active" });
    const supabase = createSupabaseMock({
      connections: [active],
      bankAccounts: [
        {
          id: "ba-1",
          connection_id: active.id,
          user_id: "user-a",
          provider_account_id: "pa-1",
          account_id: "acc-1",
          currency: "EUR",
        },
      ],
      accounts: [{ id: "acc-1", user_id: "user-a", balance: 0 }],
      transactions: [],
    });
    vi.mocked(mockProvider.getBalances).mockResolvedValue([]);
    vi.mocked(mockProvider.getTransactions).mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "TimeoutError" })
    );

    const result = await syncConnection({
      supabase,
      userId: "user-a",
      connectionId: active.id,
    });
    expect(result.errors[0]).toMatch(/Timeout/);
  });

  it("does not claim success when bank_connections update fails after sync", async () => {
    const active = baseConnection({ status: "active" });
    const supabase = createSupabaseMock({
      connections: [active],
      bankAccounts: [
        {
          id: "ba-1",
          connection_id: active.id,
          user_id: "user-a",
          provider_account_id: "pa-1",
          account_id: "acc-1",
          currency: "EUR",
        },
      ],
      accounts: [{ id: "acc-1", user_id: "user-a", balance: 0 }],
      transactions: [],
      failUpdates: new Set(["bank_connections"]),
    });
    vi.mocked(mockProvider.getBalances).mockResolvedValue([]);
    vi.mocked(mockProvider.getTransactions).mockResolvedValue([]);

    const result = await syncConnection({
      supabase,
      userId: "user-a",
      connectionId: active.id,
    });
    expect(result.errors.some((e) => e.includes("stato di sincronizzazione"))).toBe(
      true
    );
  });

  it("imports partial txs and records error on IncompleteTransactionsError", async () => {
    const { IncompleteTransactionsError } = await import("../errors");
    const active = baseConnection({ status: "active" });
    const supabase = createSupabaseMock({
      connections: [active],
      bankAccounts: [
        {
          id: "ba-1",
          connection_id: active.id,
          user_id: "user-a",
          provider_account_id: "pa-1",
          account_id: "acc-1",
          currency: "EUR",
        },
      ],
      accounts: [{ id: "acc-1", user_id: "user-a", balance: 0 }],
      transactions: [],
    });
    vi.mocked(mockProvider.getBalances).mockResolvedValue([
      { amount: 50, currency: "EUR", type: "interimAvailable" },
    ]);
    vi.mocked(mockProvider.getTransactions).mockRejectedValue(
      new IncompleteTransactionsError("paginazione incompleta", [
        {
          id: "partial-1",
          bookingDate: "2026-03-01",
          amount: -8,
          currency: "EUR",
          description: "Partial",
        },
      ])
    );

    const result = await syncConnection({
      supabase,
      userId: "user-a",
      connectionId: active.id,
    });
    expect(result.imported).toBe(1);
    expect(result.errors[0]).toMatch(/paginazione incompleta/);
  });
});

describe("handleConnectionCallback dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses MoneyFlow account when same IBAN is already linked", async () => {
    const prior = baseConnection({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      status: "disconnected",
      provider_connection_id: "req-old",
      metadata: { reference: "mf_old" },
    });
    const next = baseConnection({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      status: "pending",
      provider_connection_id: "req-new",
      metadata: { reference: "mf_ref_a" },
    });
    const state = {
      connections: [prior, next],
      bankAccounts: [
        {
          id: "ba-old",
          connection_id: prior.id,
          user_id: "user-a",
          provider_account_id: "pa-old",
          account_id: "acc-shared",
          iban_masked: "IT60 **** **** 3456",
          currency: "EUR",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ] as Row[],
      accounts: [
        {
          id: "acc-shared",
          user_id: "user-a",
          name: "Conto",
          is_archived: false,
          balance: 10,
        },
      ] as Row[],
      transactions: [] as Row[],
    };
    const supabase = createSupabaseMock(state);

    vi.mocked(mockProvider.getConnection).mockResolvedValue({
      id: "req-new",
      status: "LN",
      institutionId: "INTESA_IT",
      accounts: ["pa-new"],
      agreement: null,
    });
    vi.mocked(mockProvider.getAccounts).mockResolvedValue([
      {
        id: "pa-new",
        iban: "IT60X0542811101000000123456",
        name: "Conto",
        currency: "EUR",
      },
    ]);
    vi.mocked(mockProvider.getBalances).mockResolvedValue([
      { amount: 10, currency: "EUR", type: "interimAvailable" },
    ]);
    vi.mocked(mockProvider.getTransactions).mockResolvedValue([]);

    await handleConnectionCallback({
      supabase,
      userId: "user-a",
      ref: "mf_ref_a",
    });

    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0].id).toBe("acc-shared");
    const linked = state.bankAccounts.filter((b) => b.connection_id === next.id);
    expect(linked).toHaveLength(1);
    expect(linked[0].account_id).toBe("acc-shared");
    expect(linked[0].provider_account_id).toBe("pa-new");
  });
});

describe("disconnectConnection", () => {
  it("marks disconnected only for the owning user", async () => {
    const active = baseConnection({ status: "active" });
    const other = baseConnection({
      id: "44444444-4444-4444-4444-444444444444",
      user_id: "user-b",
      status: "active",
      provider_connection_id: "req-b",
    });
    const supabase = createSupabaseMock({
      connections: [active, other],
      bankAccounts: [],
      accounts: [],
      transactions: [],
    });
    vi.mocked(mockProvider.deleteConnection!).mockResolvedValue(undefined);

    await disconnectConnection({
      supabase,
      userId: "user-a",
      connectionId: active.id,
    });
    expect(active.status).toBe("disconnected");
    expect(other.status).toBe("active");

    await expect(
      disconnectConnection({
        supabase,
        userId: "user-a",
        connectionId: other.id,
      })
    ).rejects.toThrow(/non trovata|non autorizzata/i);
  });
});
