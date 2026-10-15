// 应用主入口：加载数据 -> 检索 -> 结果列表 + 岗位详情（表格 + 折线图）。
import { useEffect, useMemo, useState } from 'react'
import type { Dataset } from './services/data'
import { loadData, search } from './services/data'
import type { Job, SearchFilters, SearchMode } from './types'
import { debounce } from './utils/format'
import SearchPanel from './components/SearchPanel'
import ResultList from './components/ResultList'
import JobDetail from './components/JobDetail'

type Status = 'loading' | 'ready' | 'error'

const EMPTY_FILTERS: SearchFilters = { keyword: '', deptCode: '', posCode: '', years: [] }

export default function App() {
  const [status, setStatus] = useState<Status>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [data, setData] = useState<Dataset | null>(null)

  const [mode, setMode] = useState<SearchMode>('keyword')
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS)
  // 实际用于检索的关键词（防抖后），避免每次按键遍历全量
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [selected, setSelected] = useState<Job | null>(null)

  useEffect(() => {
    let alive = true
    loadData()
      .then((d) => {
        if (!alive) return
        setData(d)
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (!alive) return
        setErrMsg(e instanceof Error ? e.message : String(e))
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [])

  // 关键词防抖
  const setKwDebounced = useMemo(() => debounce((v: string) => setDebouncedKeyword(v), 250), [])
  useEffect(() => {
    setKwDebounced(filters.keyword)
  }, [filters.keyword, setKwDebounced])

  // 是否有有效检索条件
  const hasQuery =
    debouncedKeyword.trim() !== '' ||
    filters.deptCode.trim() !== '' ||
    filters.posCode.trim() !== '' ||
    filters.years.length > 0

  const result = useMemo(() => {
    if (!data || !hasQuery) return null
    return search(data, { ...filters, keyword: debouncedKeyword })
  }, [data, filters, debouncedKeyword, hasQuery])

  // 搜索建议：根据关键词从部门名中给出候选
  const suggestions = useMemo(() => {
    if (!data || mode !== 'keyword') return []
    const kw = filters.keyword.trim().toLowerCase()
    if (!kw) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const dep of data.meta.departments) {
      if (dep.toLowerCase().includes(kw)) {
        if (!seen.has(dep)) {
          seen.add(dep)
          out.push(dep)
        }
        if (out.length >= 8) break
      }
    }
    return out
  }, [data, filters.keyword, mode])

  // 结果变化时，自动选中第一个岗位（若当前未选或已不在结果中）
  useEffect(() => {
    if (!result) {
      setSelected(null)
      return
    }
    if (result.jobs.length === 0) {
      setSelected(null)
      return
    }
    setSelected((prev) => {
      if (prev && result.jobs.some((j) => j.id === prev.id)) return prev
      return result.jobs[0]
    })
  }, [result])

  const onReset = () => {
    setFilters(EMPTY_FILTERS)
    setDebouncedKeyword('')
    setSelected(null)
  }

  const onModeChange = (m: SearchMode) => {
    setMode(m)
    // 切换检索方式时清空对应另一类条件，避免混淆
    if (m === 'keyword') setFilters((f) => ({ ...f, deptCode: '', posCode: '' }))
    else setFilters((f) => ({ ...f, keyword: '' }))
  }

  return (
    <div className="min-h-full">
      {/* 顶部标题栏 */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-white">
              考
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">国考历年岗位分数线分析平台</h1>
              <p className="text-xs text-slate-500">
                {data
                  ? `覆盖 ${data.meta.years[0]}–${data.meta.years[data.meta.years.length - 1]} 年 · ${data.meta.stats.jobs.toLocaleString()} 个岗位 · ${data.meta.stats.records.toLocaleString()} 条记录`
                  : '历年国考岗位进面分数线查询与趋势分析'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
            <p className="mt-3 text-sm">正在加载历年数据…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-medium text-red-700">数据加载失败</p>
            <p className="mt-1 text-sm text-red-500">{errMsg}</p>
            <button
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          </div>
        )}

        {status === 'ready' && data && (
          <div className="space-y-5">
            <SearchPanel
              meta={data.meta}
              filters={filters}
              mode={mode}
              onModeChange={onModeChange}
              onChange={setFilters}
              suggestions={suggestions}
              onReset={onReset}
            />

            {!hasQuery ? (
              <WelcomePanel data={data} />
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <ResultList
                    jobs={result?.jobs ?? []}
                    total={result?.total ?? 0}
                    truncated={result?.truncated ?? false}
                    keyword={debouncedKeyword}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                  />
                </div>
                <div>
                  {selected ? (
                    <JobDetail job={selected} meta={data.meta} />
                  ) : (
                    <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl bg-white text-sm text-slate-400 shadow-sm ring-1 ring-slate-200">
                      从左侧选择一个岗位查看历年趋势
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-center text-xs text-slate-400 sm:px-6">
        数据来源：历年国家公务员考试岗位进面分数线原始公开数据 · 本平台仅作查询分析，分数口径横向不完全可比
      </footer>
    </div>
  )
}

function WelcomePanel({ data }: { data: Dataset }) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h2 className="text-base font-semibold text-slate-800">开始查询</h2>
      <p className="mt-1 text-sm text-slate-500">
        在上方输入<strong className="text-slate-700">部门/职位关键词</strong>，或切换到
        <strong className="text-slate-700">岗位编号检索</strong>按代码精确定位，查看该岗位历年进面分数线趋势。
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat label="覆盖年份" value={`${data.meta.years.length} 年`} sub={`${data.meta.years[0]}–${data.meta.years[data.meta.years.length - 1]}`} />
        <Stat label="跨年岗位" value={data.meta.stats.multiYearJobs.toLocaleString()} sub={`单年岗位 ${data.meta.stats.singleYearJobs.toLocaleString()}`} />
        <Stat label="分数区间" value={`${data.meta.stats.scoreMin ?? '—'} ~ ${data.meta.stats.scoreMax ?? '—'}`} sub="最低进面分数线" />
      </div>
      <div className="mt-6 rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-medium text-slate-600">数据处理说明</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>以（部门名称+用人司局+职位名称）识别跨年同一岗位；因代码跨年会复用/变更，不以代码跨年合并。</li>
          <li>同一岗位名在同一年对应多个代码/分数时标记为“同名多岗”，趋势图断点并列候选，不强行合并、不虚构。</li>
          <li>缺失或异常分数记录已剔除，不补造数据。</li>
        </ul>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-brand-600">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{sub}</div>
    </div>
  )
}
