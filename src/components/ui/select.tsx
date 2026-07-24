import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/* ─── Context ─── */
interface SelectContextValue {
  value: string
  onValueChange: (v: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>
  labels: Map<string, string>
  registerLabel: (value: string, label: string) => void
  /** 键盘高亮的 index */
  highlightedIndex: number
  setHighlightedIndex: (i: number) => void
  /** 注册 item value 顺序，供键盘导航使用 */
  itemValues: React.MutableRefObject<string[]>
  registerItemValue: (v: string) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select components must be used within <Select>")
  return ctx
}

/* ─── Root ─── */
interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}

function Select({ value, onValueChange, disabled, children }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const labelsRef = React.useRef<Map<string, string>>(new Map())
  const itemValues = React.useRef<string[]>([])
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

  const registerLabel = React.useCallback((v: string, label: string) => {
    if (labelsRef.current.get(v) !== label) {
      labelsRef.current.set(v, label)
      forceUpdate()
    }
  }, [])

  const registerItemValue = React.useCallback((v: string) => {
    if (!itemValues.current.includes(v)) {
      itemValues.current.push(v)
      forceUpdate()
    }
  }, [])

  // 打开时重置高亮到当前选中项
  const handleSetOpen = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      const idx = itemValues.current.indexOf(value)
      setHighlightedIndex(idx >= 0 ? idx : 0)
    } else {
      setHighlightedIndex(-1)
    }
  }, [value])

  // 点击外部关闭
  React.useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        handleSetOpen(false)
      }
    }
    const id = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handler)
    })
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener("pointerdown", handler)
    }
  }, [open, handleSetOpen])

  // 键盘导航：Escape / ArrowUp / ArrowDown / Enter
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const count = itemValues.current.length
      switch (e.key) {
        case "Escape":
          e.preventDefault()
          handleSetOpen(false)
          triggerRef.current?.focus()
          break
        case "ArrowDown":
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % count)
          break
        case "ArrowUp":
          e.preventDefault()
          setHighlightedIndex((prev) => (prev - 1 + count) % count)
          break
        case "Enter":
        case " ": {
          e.preventDefault()
          const v = itemValues.current[highlightedIndex]
          if (v !== undefined) {
            onValueChange(v)
            handleSetOpen(false)
            triggerRef.current?.focus()
          }
          break
        }
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onValueChange, handleSetOpen, highlightedIndex])

  const ctx: SelectContextValue = {
    value,
    onValueChange,
    open,
    setOpen: handleSetOpen,
    triggerRef,
    labels: labelsRef.current,
    registerLabel,
    highlightedIndex,
    setHighlightedIndex,
    itemValues,
    registerItemValue,
  }

  return (
    <SelectContext.Provider value={ctx}>
      <div ref={rootRef} className={cn("relative", disabled && "pointer-events-none opacity-55")}>
        {children}
      </div>
    </SelectContext.Provider>
  )
}

/* ─── Trigger ─── */
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen, triggerRef, value, labels } = useSelectContext()

  const mergedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
    },
    [ref, triggerRef]
  )

  const displayLabel = labels.get(value)

  return (
    <button
      ref={mergedRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-11 w-full items-center justify-between gap-2 whitespace-nowrap rounded-[0.625rem] border border-slate-300/60 bg-white/70 px-4 text-sm text-slate-900 shadow-sm outline-none transition",
        "hover:border-pink-400/60",
        "focus-visible:border-pink-500/55 focus-visible:bg-white/95 focus-visible:shadow-[0_0_0_3px_rgba(244,63,94,0.14)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "dark:border-white/12 dark:bg-white/[0.06] dark:text-slate-100",
        "dark:hover:border-pink-400/50",
        "dark:focus-visible:bg-white/[0.09] dark:focus-visible:shadow-[0_0_0_3px_rgba(244,63,94,0.20)]",
        className
      )}
      {...props}
    >
      <span className="truncate">{displayLabel ?? children}</span>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500",
          open && "rotate-180"
        )}
      />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

/* ─── Value (占位，保持 API 兼容) ─── */
function SelectValue({ placeholder }: { placeholder?: string }) {
  return <>{placeholder}</>
}

/* ─── Content ─── */
const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open } = useSelectContext()

  return (
    <div
      ref={ref}
      role="listbox"
      hidden={!open}
      data-state={open ? "open" : "closed"}
      className={cn(
        "absolute left-0 top-full z-50 mt-1.5 w-max min-w-full overflow-hidden rounded-xl border border-slate-200/60 bg-white/95 p-1 shadow-lg backdrop-blur-xl",
        "dark:border-white/[0.08] dark:bg-[#171a26]/95",
        "select-popover",
        className
      )}
      {...props}
    >
      <div className="max-h-[240px] overflow-y-auto p-0.5">
        {children}
      </div>
    </div>
  )
})
SelectContent.displayName = "SelectContent"

/* ─── Item ─── */
const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string; disabled?: boolean }
>(({ className, children, value: itemValue, disabled, ...props }, ref) => {
  const { value, onValueChange, setOpen, registerLabel, registerItemValue, highlightedIndex, setHighlightedIndex, itemValues } = useSelectContext()
  const isSelected = value === itemValue
  const itemRef = React.useRef<HTMLDivElement | null>(null)

  // 注册 label（useLayoutEffect 避免 render 阶段副作用）
  const label = typeof children === "string" ? children : String(children ?? "")
  React.useLayoutEffect(() => {
    registerLabel(itemValue, label)
    registerItemValue(itemValue)
  }, [itemValue, label, registerLabel, registerItemValue])

  // 高亮时滚动到可见区域
  const myIndex = itemValues.current.indexOf(itemValue)
  const isHighlighted = highlightedIndex === myIndex
  React.useEffect(() => {
    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [isHighlighted])

  if (disabled) return null

  return (
    <div
      ref={(node) => {
        itemRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      role="option"
      aria-selected={isSelected}
      onClick={(e) => {
        e.preventDefault() // 阻止 <label> 将点击转发给 trigger button
        onValueChange(itemValue)
        setOpen(false)
      }}
      onMouseEnter={() => setHighlightedIndex(myIndex)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center whitespace-nowrap rounded-lg py-2.5 pl-3 pr-8 text-sm text-slate-700 outline-none transition-colors",
        "hover:bg-pink-500/10 hover:text-pink-700",
        isHighlighted && "bg-pink-500/10 text-pink-700",
        isSelected && "font-medium text-pink-600",
        "dark:text-slate-300",
        "dark:hover:bg-pink-500/15 dark:hover:text-pink-300",
        isHighlighted && "dark:bg-pink-500/15 dark:text-pink-300",
        isSelected && "dark:text-pink-400",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {isSelected && (
        <span className="absolute right-2.5 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-3.5 w-3.5 text-pink-500 [&_path]:stroke-[3]" />
        </span>
      )}
    </div>
  )
})
SelectItem.displayName = "SelectItem"

/* ─── Group (占位，保持 API 兼容) ─── */
function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem }
