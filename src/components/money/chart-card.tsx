import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

export function ChartCard({
  title,
  description,
  href,
  linkLabel,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("mf-surface p-5", className)}>
      <SectionHeader
        title={title}
        description={description}
        href={href}
        linkLabel={linkLabel}
      />
      <div className={cn("mt-4", contentClassName)}>{children}</div>
    </div>
  );
}
