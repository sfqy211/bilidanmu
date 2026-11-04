import * as React from "react"
import { ChevronDown } from "lucide-react"
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
        // 默认紧凑尺寸：调用方可传 className 覆盖高度/宽度。
        // 不再用 44px 的大号触发器，避免在设置页/弹幕窗里显得臃肿。
        "flex h-8 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface)] px-2.5 text-[13px] text-ink shadow-none outline-none transition",
        "hover:bg-ink/[0.04]",
        "focus-visible:border-brand/55 focus-visible:shadow-[0_0_0_2px_rgb(var(--brand-rgb)/0.18)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="truncate">{displayLabel ?? children}</span>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform duration-200",
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
        // 弹层用应用统一的表面色（--app-surface），宽度与触发器一致。
        // 收窄内边距与圆角，贴合本项目紧凑的弹幕窗/设置页风格。
        "absolute left-0 top-full z-50 mt-1 w-full min-w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface)] p-1 shadow-lg backdrop-blur-xl",
        "select-popover",
        className
      )}
      {...props}
    >
      <div className="max-h-[240px] overflow-y-auto">
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
        // 紧凑行：不显示对号、不加左边条。选中态只靠文字色 + 淡底区分，
        // 避免多重装饰显得臃肿
        "relative flex w-full cursor-pointer select-none items-center whitespace-nowrap rounded-md py-1.5 pl-2.5 pr-2.5 text-[13px] text-ink-muted outline-none transition-colors",
        "hover:bg-ink/[0.06] hover:text-ink",
        isHighlighted && "bg-ink/[0.06] text-ink",
        isSelected && "bg-brand/10 font-medium text-brand",
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
    </div>
  )
})
SelectItem.displayName = "SelectItem"

/* ─── Group (占位，保持 API 兼容) ─── */
function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem }
