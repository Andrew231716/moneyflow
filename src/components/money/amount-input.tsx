"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AmountInput({
  id = "amount",
  label = "Importo",
  name = "mf-amount",
  value,
  onChange,
  className,
  inputClassName,
}: {
  id?: string;
  label?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
          €
        </span>
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          placeholder="0,00"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          className={cn(
            "h-14 pl-9 text-2xl font-semibold tracking-tight tabular-nums md:h-12 md:text-xl",
            inputClassName
          )}
        />
      </div>
    </div>
  );
}
