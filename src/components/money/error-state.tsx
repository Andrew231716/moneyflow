import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Qualcosa è andato storto",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mf-surface border-destructive/20 bg-destructive/5 flex flex-col items-center text-center px-6 py-10 gap-3",
        className
      )}
      role="alert"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="font-semibold">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" className="min-h-touch" onClick={onRetry}>
          Riprova
        </Button>
      ) : null}
    </div>
  );
}
