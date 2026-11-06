import * as React from "react";
import { cn } from "@/lib/utils";

/** shadcn-style input tuned for the dark app shell; also styles native file pickers legibly. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-white/15 bg-[#072733] px-3 py-1 text-sm text-white shadow-xs transition outline-none placeholder:text-white/40 focus-visible:border-[#d3ed05] focus-visible:ring-2 focus-visible:ring-[#d3ed05]/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-400 aria-invalid:ring-red-400/20",
        type === "file" &&
          "h-auto cursor-pointer p-1.5 text-white/80 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#d3ed05] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-black hover:file:bg-[#e4ff1a]",
        type === "checkbox" && "size-4 min-w-4 accent-[#d3ed05]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
