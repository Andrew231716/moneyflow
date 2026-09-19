import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      {(title || description) && (
        <div className="min-w-0 space-y-1">
          {title ? (
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:sr-only">
              {title}
            </h1>
          ) : null}
          {description ? (
            <p className="text-sm text-muted-foreground max-w-xl">{description}</p>
          ) : null}
        </div>
      )}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
