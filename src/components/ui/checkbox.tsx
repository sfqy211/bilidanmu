import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-[5px] border border-slate-300/80 bg-white/70 shadow-sm transition hover:border-pink-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:hover:bg-brand/90 dark:border-white/15 dark:bg-white/[0.05] dark:hover:border-pink-400/60 dark:data-[state=checked]:border-brand dark:data-[state=checked]:bg-brand",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("grid place-content-center text-white transition-transform data-[state=checked]:scale-100 data-[state=unchecked]:scale-50")}
    >
      <Check className="h-3 w-3 [&_path]:stroke-[3.5]" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
