import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/styles";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-500 focus:border-slate-950 focus:ring-2 focus:ring-slate-200",
        className,
      )}
      {...props}
    />
  );
}
