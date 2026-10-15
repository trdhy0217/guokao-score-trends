// 通用工具函数：分数格式化、防抖、数组工具。

/** 分数格式化：去除无意义尾零，保留必要小数。null -> '—' */
export function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const r = Math.round(v * 1000) / 1000
  return Number.isInteger(r) ? String(r) : String(r)
}

/** 简单防抖 */
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 250): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }) as T
}

/** 高亮关键词：返回被 <mark> 包裹的 HTML 片段数组所需的分段信息 */
export function splitByKeyword(text: string, keyword: string): Array<{ t: string; hit: boolean }> {
  if (!keyword) return [{ t: text, hit: false }]
  const kw = keyword.trim()
  if (!kw) return [{ t: text, hit: false }]
  const lower = text.toLowerCase()
  const klower = kw.toLowerCase()
  const parts: Array<{ t: string; hit: boolean }> = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(klower, i)
    if (idx === -1) {
      parts.push({ t: text.slice(i), hit: false })
      break
    }
    if (idx > i) parts.push({ t: text.slice(i, idx), hit: false })
    parts.push({ t: text.slice(idx, idx + kw.length), hit: true })
    i = idx + kw.length
  }
  return parts
}

/** 数值区间约束 */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** 导出工具：触发浏览器下载一段文本内容 */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
