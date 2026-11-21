"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Truncated text that expands to full content on tap/click.
 * Safe inside other clickable rows (stops propagation).
 */
export function ExpandableText({
  children,
  className,
  collapsedClassName = "truncate",
  expandedClassName = "whitespace-normal break-words",
  title,
  as: Comp = "span",
}: {
  children: string;
  className?: string;
  collapsedClassName?: string;
  expandedClassName?: string;
  /** Accessible hint when collapsed */
  title?: string;
  as?: "span" | "p";
}) {
  const [expanded, setExpanded] = useState(false);
  const text = children || "—";

  return (
    <Comp
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      title={
        title ?? (expanded ? "Tocca per ridurre" : "Tocca per leggere tutto")
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setExpanded((v) => !v);
        }
      }}
      className={cn(
        "block max-w-full cursor-pointer text-left rounded-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        expanded ? expandedClassName : collapsedClassName,
        className
      )}
    >
      {text}
    </Comp>
  );
}
