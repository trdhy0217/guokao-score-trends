// 数据类型定义：原始紧凑结构（来自 public/data/*.json）与解码后的易用结构。

/** meta.json：质量记录中单个文件的统计 */
export interface QualityFile {
  file: string
  year: number
  rawRows: number
  droppedBadRows: number
  dedupExpandedRows: number
  uniqueJobs: number
}

/** meta.json 顶层结构 */
export interface Meta {
  generatedAt: string
  years: number[]
  sourceFiles: Record<string, string>
  departments: string[]
  bureaus: string[]
  stats: {
    records: number
    jobs: number
    multiYearJobs: number
    singleYearJobs: number
    ambiguousYearCells: number
    scoreMin: number | null
    scoreMax: number | null
  }
  quality: {
    files: QualityFile[]
    dropped_rows: number
  }
  schema?: Record<string, string>
  notes: string[]
}

// ---- jobs.json 原始紧凑编码 ----
/** [year, score, dcIndex, pcIndex] */
export type RawSeriesPoint = [number, number, number, number]
/** [score, dcIndex, pcIndex] */
export type RawCand = [number, number, number]
/** [year, candidates[]] */
export type RawAmbiguous = [number, RawCand[]]

export interface RawJob {
  id: number
  d: number // departments 索引
  b: number // bureaus 索引，-1 表示空
  pos: string
  dcs: string[] // 部门代码字典
  pcs: string[] // 职位代码字典
  s: RawSeriesPoint[]
  a: RawAmbiguous[]
}

// ---- 解码后的结构 ----
export interface ScorePoint {
  year: number
  score: number | null
  deptCode: string
  posCode: string
}

export interface AmbiguousCandidate {
  score: number | null
  deptCode: string
  posCode: string
}

export interface AmbiguousPoint {
  year: number
  candidates: AmbiguousCandidate[]
}

export interface Job {
  id: number
  department: string
  bureau: string
  position: string
  deptCodes: string[]
  posCodes: string[]
  /** 可唯一确定的年度分数点（升序） */
  series: ScorePoint[]
  /** 歧义年份（同名多岗，趋势图断点展示并列候选） */
  ambiguous: AmbiguousPoint[]
  /** 覆盖的全部年份（series + ambiguous） */
  years: number[]
  /** 最新一年的分数（用于默认排序/展示），无则 null */
  latestScore: number | null
  /** 预拼接的小写检索串（部门+司局+职位+代码） */
  searchText: string
}

/** 结果表格的扁平行（一个岗位一行） */
export interface TableRow {
  job: Job
}

export interface SearchFilters {
  keyword: string
  deptCode: string
  posCode: string
  /** 选中的年份集合；为空表示全部 */
  years: number[]
}

export type SearchMode = 'keyword' | 'code'
