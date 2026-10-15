// 岗位详情：历年分数线表格（含数据来源）+ 折线图 + CSV 导出。
import { useMemo } from 'react'
import type { Job, Meta } from '../types'
import { fmtScore, downloadText } from '../utils/format'
import TrendChart from './TrendChart'

interface Props {
  job: Job
  meta: Meta
}

interface YearRow {
  year: number
  department: string
  position: string
  deptCode: string
  posCode: string
  score: number | null
  source: string
  ambiguous: boolean
  note?: string
}

export default function JobDetail({ job, meta }: Props) {
  const rows = useMemo<YearRow[]>(() => {
    const map = new Map<number, YearRow>()
    for (const p of job.series) {
      map.set(p.year, {
        year: p.year,
        department: job.department,
        position: job.position,
        deptCode: p.deptCode,
        posCode: p.posCode,
        score: p.score,
        source: meta.sourceFiles[String(p.year)] ?? '',
        ambiguous: false,
      })
    }
    for (const ap of job.ambiguous) {
      // 歧义年份合并为一行，分数列标注“多岗”，代码列列出候选
      const codes = ap.candidates.map((c) => c.posCode).join(' / ')
      const scores = ap.candidates.map((c) => fmtScore(c.score)).join(' / ')
      map.set(ap.year, {
        year: ap.year,
        department: job.department,
        position: job.position,
        deptCode: ap.candidates[0]?.deptCode ?? '',
        posCode: codes,
        score: null,
        source: meta.sourceFiles[String(ap.year)] ?? '',
        ambiguous: true,
        note: `同名多岗(${ap.candidates.length})：${scores}`,
      })
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year)
  }, [job, meta])

  const exportCsv = () => {
    const header = ['考试年份', '部门名称', '职位名称', '部门代码', '职位代码', '最低进面分数线', '数据来源', '备注']
    const lines = [header.join(',')]
    for (const r of rows) {
      const cells = [
        r.year,
        r.department,
        r.position,
        r.deptCode,
        r.posCode,
        r.ambiguous ? '' : fmtScore(r.score),
        r.source,
        r.note ?? '',
      ].map((c) => {
        const s = String(c ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      })
      lines.push(cells.join(','))
    }
    // 加 BOM 以便 Excel 正确识别 UTF-8
    downloadText(`${job.department}-${job.position}-历年分数线.csv`, '\ufeff' + lines.join('\n'), 'text/csv')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900" title={job.position}>
              {job.position}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {job.department}
              {job.bureau ? ` · ${job.bureau}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>部门代码：{job.deptCodes.join(' / ')}</span>
              <span>职位代码：{job.posCodes.join(' / ')}</span>
            </div>
          </div>
          <button
            className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-100"
            onClick={exportCsv}
          >
            导出 CSV
          </button>
        </div>
      </div>

      {/* 折线图 */}
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <h3 className="mb-2 text-sm font-medium text-slate-700">历年进面分数线趋势</h3>
        <TrendChart job={job} />
        <p className="mt-2 text-xs text-slate-400">
          缺失年份断点展示（不补造数据）；橙色菱形为该年“同名多岗”候选，需结合职位代码区分。
        </p>
      </div>

      {/* 历年数据表格 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
          历年数据明细
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">考试年份</th>
                <th className="px-4 py-2.5 font-medium">部门名称</th>
                <th className="px-4 py-2.5 font-medium">职位名称</th>
                <th className="px-4 py-2.5 font-medium">部门代码</th>
                <th className="px-4 py-2.5 font-medium">职位代码</th>
                <th className="px-4 py-2.5 text-right font-medium">最低进面分数线</th>
                <th className="px-4 py-2.5 font-medium">数据来源</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{r.year}</td>
                  <td className="max-w-[180px] px-4 py-3">
                    <div className="truncate text-slate-600" title={r.department}>
                      {r.department}
                    </div>
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    <div className="truncate text-slate-600" title={r.position}>
                      {r.position}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.deptCode}</td>
                  <td className="max-w-[200px] px-4 py-3 text-slate-500">
                    <div className="truncate" title={r.posCode}>
                      {r.posCode}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {r.ambiguous ? (
                      <span className="text-xs font-normal text-amber-600" title={r.note}>
                        多岗
                      </span>
                    ) : (
                      fmtScore(r.score)
                    )}
                  </td>
                  <td className="max-w-[160px] px-4 py-3">
                    <div className="truncate text-xs text-slate-400" title={r.source}>
                      {r.source}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
