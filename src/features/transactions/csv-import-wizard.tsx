"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import type { Account, Category, ClassificationRule } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { classifyDescription } from "@/lib/finance/classification";
import { adjustAccountBalance, balanceDeltaForTx, writeAudit } from "@/lib/data/mutations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, parseAmount } from "@/lib/utils";

type Step = "upload" | "map" | "preview" | "confirm";

interface CsvRow {
  [key: string]: string;
}

interface MappedRow {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category_id: string | null;
  duplicate: boolean;
  raw: CsvRow;
}

export function CsvImportWizard({
  accounts,
  categories,
  rules,
  existingKeys,
}: {
  accounts: Account[];
  categories: Category[];
  rules: ClassificationRule[];
  existingKeys: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [map, setMap] = useState({ date: "", description: "", amount: "" });
  const [mapped, setMapped] = useState<MappedRow[]>([]);
  const [saving, setSaving] = useState(false);

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);

  function onFile(file: File) {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields ?? [];
        setHeaders(cols);
        setRows(res.data);
        setMap({
          date: guess(cols, ["date", "data", "valuta"]),
          description: guess(cols, ["description", "descrizione", "causale", "memo"]),
          amount: guess(cols, ["amount", "importo", "euro", "valore"]),
        });
        setStep("map");
      },
      error: () => toast.error("Impossibile leggere il CSV"),
    });
  }

  function buildPreview() {
    const result: MappedRow[] = rows.map((raw) => {
      const amountRaw = parseAmount(raw[map.amount] ?? "0");
      const amount = Math.abs(amountRaw);
      const type: "income" | "expense" = amountRaw >= 0 ? "income" : "expense";
      // if amount column is always positive, try sign from description — default expense for bank exports often negative for outflows
      let finalType = type;
      const desc = (raw[map.description] ?? "").trim();
      const date = normalizeDate(raw[map.date] ?? "");
      // Heuristic: Italian bank CSVs often have signed amounts
      if (amountRaw < 0) finalType = "expense";
      else if (amountRaw > 0 && /stipendio|accredito|bonifico in/i.test(desc))
        finalType = "income";
      else if (amountRaw > 0 && map.amount) finalType = "income";

      const cat = classifyDescription(desc, rules, categories);
      const key = `${date}|${amount.toFixed(2)}|${desc.toLowerCase()}`;
      return {
        date,
        description: desc,
        amount,
        type: finalType,
        category_id: cat && cat.type === finalType ? cat.id : null,
        duplicate: existing.has(key),
        raw,
      };
    });
    setMapped(result.filter((r) => r.amount > 0 && r.date));
    setStep("preview");
  }

  async function confirmImport() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      if (!accountId) throw new Error("Seleziona un conto");

      const toImport = mapped.filter((r) => !r.duplicate);
      if (!toImport.length) throw new Error("Nessuna riga da importare");

      const payload = toImport.map((r) => ({
        user_id: user.id,
        account_id: accountId,
        category_id: r.category_id,
        type: r.type,
        amount: r.amount,
        description: r.description,
        original_description: r.description,
        date: r.date,
        source: "csv" as const,
        category_source: r.category_id ? ("rule" as const) : ("csv" as const),
        raw_data: r.raw,
      }));

      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw error;

      let delta = 0;
      for (const r of toImport) {
        delta += balanceDeltaForTx(r.type, r.amount);
      }
      await adjustAccountBalance(accountId, delta);
      await writeAudit({
        entity_type: "transaction",
        action: "csv_import",
        after_data: { count: toImport.length, account_id: accountId },
      });

      toast.success(`Importati ${toImport.length} movimenti`);
      router.push("/transactions");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore import");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importa CSV</CardTitle>
        <CardDescription>
          Wizard guidato: caricamento → mappatura → anteprima → conferma. Nessun import automatico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 text-xs">
          {(["upload", "map", "preview", "confirm"] as Step[]).map((s) => (
            <Badge key={s} variant={step === s ? "default" : "secondary"}>
              {s}
            </Badge>
          ))}
        </div>

        {step === "upload" && (
          <div className="space-y-3">
            <Label>File CSV</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Conto destinazione</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(["date", "description", "amount"] as const).map((field) => (
              <div key={field} className="space-y-2">
                <Label>
                  {field === "date"
                    ? "Colonna data"
                    : field === "description"
                      ? "Colonna descrizione"
                      : "Colonna importo"}
                </Label>
                <Select
                  value={map[field]}
                  onValueChange={(v) => setMap({ ...map, [field]: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona colonna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button
              onClick={buildPreview}
              disabled={!map.date || !map.description || !map.amount}
            >
              Anteprima
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {mapped.length} righe · {mapped.filter((r) => r.duplicate).length} duplicati esclusi
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border divide-y">
              {mapped.slice(0, 50).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {r.description}{" "}
                      {r.duplicate && <Badge variant="warning">duplicato</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.date}</p>
                  </div>
                  <span className={r.type === "income" ? "text-success" : "text-destructive"}>
                    {formatCurrency(r.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("map")}>
                Indietro
              </Button>
              <Button onClick={() => setStep("confirm")}>Continua</Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3">
            <p className="text-sm">
              Confermi l&apos;import di{" "}
              <strong>{mapped.filter((r) => !r.duplicate).length}</strong> movimenti?
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("preview")}>
                Indietro
              </Button>
              <Button onClick={confirmImport} disabled={saving}>
                {saving ? "Import…" : "Conferma import"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function guess(cols: string[], keys: string[]): string {
  const lower = cols.map((c) => c.toLowerCase());
  for (const k of keys) {
    const i = lower.findIndex((c) => c.includes(k));
    if (i >= 0) return cols[i];
  }
  return cols[0] ?? "";
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${mo}-${d}`;
  }
  return s;
}
