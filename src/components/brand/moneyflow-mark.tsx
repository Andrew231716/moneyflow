import { cn } from "@/lib/utils";

type MoneyFlowMarkProps = {
  className?: string;
  /** Visual size of the mark tile */
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-xl",
  lg: "h-12 w-12 rounded-2xl",
} as const;

/**
 * Brand mark: flowing value stream + rising trend + subtle currency cue.
 * Matches MoneyFlow teal premium UI (not crypto).
 */
export function MoneyFlowMark({ className, size = "md" }: MoneyFlowMarkProps) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-primary text-primary-foreground shadow-soft",
        sizeClass[size],
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        className="h-[70%] w-[70%]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Flow line rising */}
        <path
          d="M4 22c4-3 7-4.5 10.5-4.5S20 19.5 23.5 18c2-0.8 3.8-2.6 5.5-5.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 25.5c3.5-2.4 6.2-3.5 9.5-3.5s6 1.6 9 0.6c2.2-0.7 4.1-2.3 5.8-4.8"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Trend tip */}
        <path
          d="M23.2 10.2l5.2-0.4-1.8 4.6-1.4-1.7-4.4 3.8-1.7-1.9 4.4-3.8z"
          fill="currentColor"
        />
        {/* Soft euro cue */}
        <path
          d="M9.2 12.2c-1.8 0.7-3 2.2-3 4s1.2 3.3 3 4"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6.4 14.8h3.4M6.6 17.2h3.1"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function MoneyFlowWordmark({
  className,
  showTagline = true,
  markSize = "md",
}: {
  className?: string;
  showTagline?: boolean;
  markSize?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <MoneyFlowMark size={markSize} />
      <div className="min-w-0">
        <p className="font-semibold tracking-tight text-lg leading-none">MoneyFlow</p>
        {showTagline ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">Finanze personali</p>
        ) : null}
      </div>
    </div>
  );
}
