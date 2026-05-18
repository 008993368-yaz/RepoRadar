import type { HTMLAttributes } from "react";

import { cn } from "@/lib/styles";

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-4", className)} {...props} />;
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("inline-flex rounded-md border border-slate-200 bg-slate-100 p-1", className)}
      role="tablist"
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn("rounded px-3 py-1.5 text-sm font-medium text-slate-700", className)}
      role="tab"
      type="button"
      {...props}
    />
  );
}
