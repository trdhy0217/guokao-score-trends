// 检索面板：双检索方式（部门/职位关键词 + 代码检索）、年份筛选、搜索建议。
import { useMemo, useRef, useState } from 'react'
import type { Meta, SearchFilters, SearchMode } from '../types'

interface Props {
  meta: Meta
  filters: SearchFilters
  mode: SearchMode
  onModeChange: (m: SearchMode) => void
  onChange: (f: SearchFilters) => void
  /** 关键词建议候选（部门/职位名） */
  suggestions: string[]
  onReset: () => void
}

export default function SearchPanel({
  meta,
  filters,
  mode,
  onModeChange,
  onChange,
  suggestions,
  onReset,
}: Props) {
  const [showSug, setShowSug] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleYear = (y: number) => {
    const set = new Set(filters.years)
    if (set.has(y)) set.delete(y)
    else set.add(y)
    onChange({ ...filters, years: Array.from(set).sort((a, b) => a - b) })
  }

  const allYearsSelected = filters.years.length === 0
  const sug = useMemo(() => suggestions.slice(0, 8), [suggestions])

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      {/* 检索方式切换 */}
      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        <button
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            mode === 'keyword' ? 'bg-white text-brand-600 shadow' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => onModeChange('keyword')}
        >
          部门 / 职位检索
        </button>
        <button
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            mode === 'code' ? 'bg-white text-brand-600 shadow' : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => onModeChange('code')}
        >
          岗位编号检索
        </button>
      </div>

      {mode === 'keyword' ? (
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            部门名称 / 职位名称（支持空格分词模糊匹配）
          </label>
          <input
            type="text"
            value={filters.keyword}
            placeholder="如：税务局 一级行政执法员"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            onChange={(e) => onChange({ ...filters, keyword: e.target.value })}
            onFocus={() => setShowSug(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setShowSug(false), 150)
            }}
          />
          {showSug && filters.keyword.trim() && sug.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {sug.map((s) => (
                <li key={s}>
                  <button
                    className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-50"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (blurTimer.current) clearTimeout(blurTimer.current)
                      onChange({ ...filters, keyword: s })
                      setShowSug(false)
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              部门代码（可单独或与职位代码组合，支持前缀）
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={filters.deptCode}
              placeholder="如：130119"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              onChange={(e) => onChange({ ...filters, deptCode: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              职位代码（支持精确或前缀匹配）
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={filters.posCode}
              placeholder="如：300110012005"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              onChange={(e) => onChange({ ...filters, posCode: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* 年份筛选 */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">年份筛选（可多选，不选=全部）</span>
          <button className="text-xs text-brand-600 hover:underline" onClick={onReset}>
            重置条件
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              allYearsSelected
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            onClick={() => onChange({ ...filters, years: [] })}
          >
            全部
          </button>
          {meta.years.map((y) => {
            const active = filters.years.includes(y)
            return (
              <button
                key={y}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                onClick={() => toggleYear(y)}
              >
                {y}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
