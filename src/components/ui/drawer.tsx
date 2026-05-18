import type { HTMLAttributes } from "react";

import { cn } from "@/lib/styles";

export function Drawer({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn("rounded-lg border border-slate-200 bg-white p-5 shadow-sm", className)}
      {...props}
    />
  );
}
