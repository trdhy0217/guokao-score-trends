// 检索结果列表：以岗位（跨年语义键）为行，支持排序与分页，点击查看详情。
import { useMemo, useState } from 'react'
import type { Job } from '../types'
import { fmtScore, splitByKeyword } from '../utils/format'

interface Props {
  jobs: Job[]
  total: number
  truncated: boolean
  keyword: string
  selectedId: number | null
  onSelect: (job: Job) => void
}

type SortKey = 'default' | 'latest' | 'coverage' | 'department'
const PAGE_SIZE = 20

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const parts = splitByKeyword(text, keyword)
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  )
}

export default function ResultList({
  jobs,
  total,
  truncated,
  keyword,
  selectedId,
  onSelect,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    const arr = [...jobs]
    if (sortKey === 'latest') {
      arr.sort((a, b) => (b.latestScore ?? -1) - (a.latestScore ?? -1))
    } else if (sortKey === 'coverage') {
      arr.sort((a, b) => b.years.length - a.years.length)
    } else if (sortKey === 'department') {
      arr.sort((a, b) => a.department.localeCompare(b.department, 'zh-Hans-CN'))
    }
    return arr
  }, [jobs, sortKey])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const curPage = Math.min(page, pageCount)
  const pageItems = sorted.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  // 条件变化时回到第 1 页
  useMemo(() => setPage(1), [jobs, sortKey])

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 text-center shadow-sm ring-1 ring-slate-200">
        <div className="text-4xl">🔍</div>
        <p className="mt-3 text-sm text-slate-500">未找到匹配的岗位</p>
        <p className="mt-1 text-xs text-slate-400">试试调整关键词、放宽年份筛选，或改用代码检索</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="text-sm text-slate-600">
          共 <b className="text-brand-600">{total}</b> 个岗位
          {truncated && <span className="ml-1 text-xs text-amber-600">（仅展示前 {jobs.length} 个，请细化条件）</span>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">排序</span>
          {([
            ['default', '默认'],
            ['latest', '最新分数'],
            ['coverage', '覆盖年份'],
            ['department', '部门'],
          ] as [SortKey, string][]).map(([k, label]) => (
            <button
              key={k}
              className={`rounded-md px-2 py-1 transition ${
                sortKey === k ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:bg-slate-100'
              }`}
              onClick={() => setSortKey(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 font-medium">部门名称</th>
              <th className="px-4 py-2.5 font-medium">用人司局</th>
              <th className="px-4 py-2.5 font-medium">职位名称</th>
              <th className="px-4 py-2.5 font-medium">覆盖年份</th>
              <th className="px-4 py-2.5 text-right font-medium">最新分数</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((job) => {
              const active = job.id === selectedId
              return (
                <tr
                  key={job.id}
                  className={`cursor-pointer border-b border-slate-50 transition last:border-0 ${
                    active ? 'bg-brand-50/70' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => onSelect(job)}
                >
                  <td className="max-w-[220px] px-4 py-3 align-top">
                    <div className="truncate font-medium text-slate-800" title={job.department}>
                      <Highlight text={job.department} keyword={keyword} />
                    </div>
                  </td>
                  <td className="max-w-[200px] px-4 py-3 align-top text-slate-500">
                    <div className="truncate" title={job.bureau}>
                      <Highlight text={job.bureau || '—'} keyword={keyword} />
                    </div>
                  </td>
                  <td className="max-w-[260px] px-4 py-3 align-top">
                    <div className="truncate text-slate-700" title={job.position}>
                      <Highlight text={job.position} keyword={keyword} />
                    </div>
                    {job.ambiguous.length > 0 && (
                      <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                        含同名多岗年份
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600">
                    <span className="whitespace-nowrap">
                      {job.years[0]}
                      {job.years.length > 1 ? `–${job.years[job.years.length - 1]}` : ''}
                    </span>
                    <span className="ml-1 text-xs text-slate-400">（{job.years.length}年）</span>
                  </td>
                  <td className="px-4 py-3 text-right align-top font-semibold text-slate-800">
                    {fmtScore(job.latestScore)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          <button
            className="rounded-md px-3 py-1.5 text-slate-600 enabled:hover:bg-slate-100 disabled:opacity-40"
            disabled={curPage <= 1}
            onClick={() => setPage(curPage - 1)}
          >
            上一页
          </button>
          <span className="text-xs text-slate-500">
            第 {curPage} / {pageCount} 页
          </span>
          <button
            className="rounded-md px-3 py-1.5 text-slate-600 enabled:hover:bg-slate-100 disabled:opacity-40"
            disabled={curPage >= pageCount}
            onClick={() => setPage(curPage + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
