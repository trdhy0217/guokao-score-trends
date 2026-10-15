// 数据服务层：加载 JSON、解码紧凑结构、建立索引、提供检索与查询。
import type {
  Meta,
  RawJob,
  Job,
  ScorePoint,
  AmbiguousPoint,
  SearchFilters,
} from '../types'

interface Dataset {
  meta: Meta
  jobs: Job[]
  /** 部门代码 -> 岗位索引列表 */
  byDeptCode: Map<string, number[]>
  /** 职位代码 -> 岗位索引列表 */
  byPosCode: Map<string, number[]>
}

let cache: Dataset | null = null
let loading: Promise<Dataset> | null = null

/** 拼接资源基础路径，适配 GitHub Pages 子路径部署 */
function dataUrl(name: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}data/${name}`.replace(/\/{2,}/g, '/')
}

function decodeJob(raw: RawJob, meta: Meta): Job {
  const department = meta.departments[raw.d] ?? ''
  const bureau = raw.b >= 0 ? meta.bureaus[raw.b] ?? '' : ''
  const series: ScorePoint[] = raw.s.map(([year, score, dci, pci]) => ({
    year,
    score,
    deptCode: raw.dcs[dci] ?? '',
    posCode: raw.pcs[pci] ?? '',
  }))
  const ambiguous: AmbiguousPoint[] = raw.a.map(([year, cands]) => ({
    year,
    candidates: cands.map(([score, dci, pci]) => ({
      score,
      deptCode: raw.dcs[dci] ?? '',
      posCode: raw.pcs[pci] ?? '',
    })),
  }))
  const years = Array.from(
    new Set([...series.map((p) => p.year), ...ambiguous.map((p) => p.year)]),
  ).sort((a, b) => a - b)
  const latestScore = series.length ? series[series.length - 1].score : null
  const searchText = [department, bureau, raw.pos, raw.dcs.join(' '), raw.pcs.join(' ')]
    .join(' ')
    .toLowerCase()
  return {
    id: raw.id,
    department,
    bureau,
    position: raw.pos,
    deptCodes: raw.dcs,
    posCodes: raw.pcs,
    series,
    ambiguous,
    years,
    latestScore,
    searchText,
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载失败 ${res.status}: ${url}`)
  return (await res.json()) as T
}

/** 加载并解码数据集（单例缓存） */
export function loadData(): Promise<Dataset> {
  if (cache) return Promise.resolve(cache)
  if (loading) return loading
  loading = (async () => {
    const [meta, rawJobs] = await Promise.all([
      fetchJson<Meta>(dataUrl('meta.json')),
      fetchJson<RawJob[]>(dataUrl('jobs.json')),
    ])
    const jobs = rawJobs.map((r) => decodeJob(r, meta))
    const byDeptCode = new Map<string, number[]>()
    const byPosCode = new Map<string, number[]>()
    jobs.forEach((job, i) => {
      for (const dc of job.deptCodes) {
        const arr = byDeptCode.get(dc)
        if (arr) arr.push(i)
        else byDeptCode.set(dc, [i])
      }
      for (const pc of job.posCodes) {
        const arr = byPosCode.get(pc)
        if (arr) arr.push(i)
        else byPosCode.set(pc, [i])
      }
    })
    cache = { meta, jobs, byDeptCode, byPosCode }
    return cache
  })()
  return loading
}

/** 岗位是否覆盖所选年份（任一命中即可） */
function hitYears(job: Job, years: number[]): boolean {
  if (!years.length) return true
  for (const y of job.years) if (years.includes(y)) return true
  return false
}

const MAX_RESULTS = 500

export interface SearchResult {
  jobs: Job[]
  total: number
  truncated: boolean
}

/**
 * 统一检索：
 *  - keyword：在 部门/司局/职位 中按空格分词做 AND 模糊匹配
 *  - deptCode / posCode：按代码前缀匹配（精确或前缀）
 *  - years：岗位需覆盖所选年份之一
 */
export function search(data: Dataset, filters: SearchFilters): SearchResult {
  const keyword = filters.keyword.trim().toLowerCase()
  const tokens = keyword ? keyword.split(/\s+/).filter(Boolean) : []
  const deptCode = filters.deptCode.trim()
  const posCode = filters.posCode.trim()

  // 代码检索：优先用倒排索引缩小候选集
  let candidateIdx: number[] | null = null
  if (posCode && data.byPosCode.has(posCode)) {
    candidateIdx = data.byPosCode.get(posCode)!
  } else if (deptCode && !posCode && data.byDeptCode.has(deptCode)) {
    candidateIdx = data.byDeptCode.get(deptCode)!
  }

  const pool = candidateIdx ? candidateIdx.map((i) => data.jobs[i]) : data.jobs

  const matched: Job[] = []
  for (const job of pool) {
    // 关键词 AND
    if (tokens.length) {
      let ok = true
      for (const t of tokens) {
        if (!job.searchText.includes(t)) {
          ok = false
          break
        }
      }
      if (!ok) continue
    }
    // 代码前缀匹配（当未命中倒排或需要前缀匹配时）
    if (deptCode) {
      if (!job.deptCodes.some((c) => c.startsWith(deptCode))) continue
    }
    if (posCode) {
      if (!job.posCodes.some((c) => c.startsWith(posCode))) continue
    }
    // 年份筛选
    if (!hitYears(job, filters.years)) continue

    matched.push(job)
  }

  const total = matched.length
  const jobs = matched.slice(0, MAX_RESULTS)
  return { jobs, total, truncated: total > MAX_RESULTS }
}

export function getJobById(data: Dataset, id: number): Job | undefined {
  return data.jobs[id]?.id === id ? data.jobs[id] : data.jobs.find((j) => j.id === id)
}

export type { Dataset }
