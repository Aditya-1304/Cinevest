import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full resize-y rounded-md border border-white/15 bg-[#072733] px-3 py-2 text-sm text-white shadow-xs transition outline-none placeholder:text-white/40 focus-visible:border-[#d3ed05] focus-visible:ring-2 focus-visible:ring-[#d3ed05]/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-400",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
