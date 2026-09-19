import { cn, formatCurrency } from "@/lib/utils";

type Tone = "default" | "success" | "danger" | "warning" | "muted";
type Size = "sm" | "md" | "lg" | "xl" | "hero";

const sizeClass: Record<Size, string> = {
  sm: "text-value-sm",
  md: "text-value-md",
  lg: "text-value-lg",
  xl: "text-value-xl",
  hero: "text-value-hero",
};

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-income",
  danger: "text-expense",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

export function MoneyValue({
  amount,
  currency = "EUR",
  signed,
  type,
  tone,
  size = "md",
  className,
}: {
  amount: number;
  currency?: string;
  /** Prefix + / − based on amount sign */
  signed?: boolean;
  /** Force income/expense styling from transaction type */
  type?: "income" | "expense" | "transfer";
  tone?: Tone;
  size?: Size;
  className?: string;
}) {
  const resolvedTone: Tone =
    tone ??
    (type === "income"
      ? "success"
      : type === "expense"
        ? "danger"
        : "default");

  let prefix = "";
  if (signed || type === "income" || type === "expense") {
    if (type === "income" || (signed && amount > 0 && type !== "expense")) {
      prefix = "+";
    } else if (type === "expense" || (signed && amount < 0)) {
      prefix = "−";
    }
  }

  const display = formatCurrency(Math.abs(amount), currency);

  return (
    <span
      className={cn(
        "mf-value inline-block",
        sizeClass[size],
        toneClass[resolvedTone],
        className
      )}
    >
      {prefix}
      {display}
    </span>
  );
}
