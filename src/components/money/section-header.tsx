import Link from "next/link";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  description,
  href,
  linkLabel = "Vedi tutti",
  action,
  className,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
      {!action && href ? (
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline shrink-0 min-h-touch inline-flex items-center"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
