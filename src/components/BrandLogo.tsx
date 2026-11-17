/**
 * 应用图标（内联 SVG）。
 *
 * 之前用 `<img src={logo.svg}>`，外部 SVG 无法读取页面的 CSS 变量，
 * 颜色永远是文件里写死的粉色。内联后 `fill=currentColor` 可跟随
 * `text-brand`（即主题强调色 `--brand-rgb`），切换主题时即时变色。
 */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M 100 54 H 260 C 374 54 451 135 451 256 C 451 377 374 458 260 458 H 100 C 77 458 61 439 61 417 C 61 399 70 386 86 376 C 103 366 111 351 111 331 V 181 C 111 161 103 146 86 136 C 70 126 61 113 61 95 C 61 73 77 54 100 54 Z M 216 155 L 354 234 C 371 244 371 268 354 278 L 216 357 C 196 369 179 355 179 333 V 179 C 179 157 196 143 216 155 Z"
      />
    </svg>
  );
}
