"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AmountInput({
  id = "amount",
  label = "Importo",
  value,
  onChange,
  className,
  inputClassName,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
          €
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          autoComplete="off"
          className={cn(
            "h-14 pl-9 text-2xl font-semibold tracking-tight tabular-nums md:h-12 md:text-xl",
            inputClassName
          )}
        />
      </div>
    </div>
  );
}
