// 数据层端到端功能验证（Node 直接跑，不依赖浏览器）。
// 复刻 src/services/data.ts 的解码 + 检索逻辑，针对真实 JSON 验证正确性。
import fs from 'node:fs'
import path from 'node:path'

const DATA = path.resolve('public/data')
const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf-8'))
const rawJobs = JSON.parse(fs.readFileSync(path.join(DATA, 'jobs.json'), 'utf-8'))

let pass = 0
let fail = 0
function assert(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}  ${extra}`)
  }
}

function decode(raw) {
  const department = meta.departments[raw.d] ?? ''
  const bureau = raw.b >= 0 ? meta.bureaus[raw.b] ?? '' : ''
  const series = raw.s.map(([year, score, dci, pci]) => ({
    year, score, deptCode: raw.dcs[dci] ?? '', posCode: raw.pcs[pci] ?? '',
  }))
  const ambiguous = raw.a.map(([year, cands]) => ({
    year, candidates: cands.map(([score, dci, pci]) => ({ score, deptCode: raw.dcs[dci] ?? '', posCode: raw.pcs[pci] ?? '' })),
  }))
  const years = Array.from(new Set([...series.map(p => p.year), ...ambiguous.map(p => p.year)])).sort((a, b) => a - b)
  const searchText = [department, bureau, raw.pos, raw.dcs.join(' '), raw.pcs.join(' ')].join(' ').toLowerCase()
  return { id: raw.id, department, bureau, position: raw.pos, deptCodes: raw.dcs, posCodes: raw.pcs, series, ambiguous, years,
    latestScore: series.length ? series[series.length - 1].score : null, searchText }
}

console.log('== 1. 元数据与规模 ==')
assert('years = 2019..2026', JSON.stringify(meta.years) === JSON.stringify([2019,2020,2021,2022,2023,2024,2025,2026]))
assert('8 个数据来源文件', Object.keys(meta.sourceFiles).length === 8)
assert('岗位数与数组长度一致', rawJobs.length === meta.stats.jobs, `${rawJobs.length} vs ${meta.stats.jobs}`)
assert('departments 字典非空', meta.departments.length > 0)

console.log('== 2. 解码正确性 ==')
const jobs = rawJobs.map(decode)
assert('全部岗位可解码', jobs.length === rawJobs.length)
assert('每个 series 点都有 year/score', jobs.every(j => j.series.every(p => typeof p.year === 'number')))
// 校验代码索引不越界（解码出的 deptCode/posCode 非空当且仅当字典有值）
let badCode = 0
for (const j of jobs) {
  for (const p of j.series) { if (!p.deptCode || !p.posCode) badCode++ }
}
assert('series 代码索引无越界(空)', badCode === 0, `空代码数=${badCode}`)
// series 年份升序
assert('series 年份升序', jobs.every(j => j.series.every((p, i, a) => i === 0 || a[i-1].year < p.year)))

console.log('== 3. 分数区间 ==')
const allScores = jobs.flatMap(j => j.series.map(p => p.score)).filter(s => s !== null)
const mn = Math.min(...allScores), mx = Math.max(...allScores)
assert('分数>=40', mn >= 40, `min=${mn}`)
assert('分数<=160', mx <= 160, `max=${mx}`)
assert('与 meta.stats 分数区间一致', mn === meta.stats.scoreMin && mx === meta.stats.scoreMax, `${mn}/${mx} vs ${meta.stats.scoreMin}/${meta.stats.scoreMax}`)

console.log('== 4. 跨年 / 歧义统计 ==')
const multi = jobs.filter(j => j.years.length > 1).length
const single = jobs.filter(j => j.years.length === 1).length
assert('跨年岗位数一致', multi === meta.stats.multiYearJobs, `${multi} vs ${meta.stats.multiYearJobs}`)
assert('单年岗位数一致', single === meta.stats.singleYearJobs, `${single} vs ${meta.stats.singleYearJobs}`)
const ambCells = jobs.reduce((s, j) => s + j.ambiguous.length, 0)
assert('歧义年份单元数一致', ambCells === meta.stats.ambiguousYearCells, `${ambCells} vs ${meta.stats.ambiguousYearCells}`)

console.log('== 5. 检索：关键词（部门+职位 AND 模糊） ==')
function search(filters) {
  const kw = (filters.keyword || '').trim().toLowerCase()
  const tokens = kw ? kw.split(/\s+/).filter(Boolean) : []
  const deptCode = (filters.deptCode || '').trim()
  const posCode = (filters.posCode || '').trim()
  const matched = []
  for (const job of jobs) {
    if (tokens.length && !tokens.every(t => job.searchText.includes(t))) continue
    if (deptCode && !job.deptCodes.some(c => c.startsWith(deptCode))) continue
    if (posCode && !job.posCodes.some(c => c.startsWith(posCode))) continue
    if (filters.years && filters.years.length && !job.years.some(y => filters.years.includes(y))) continue
    matched.push(job)
  }
  return matched
}
const r1 = search({ keyword: '税务局 一级行政执法员' })
assert('“税务局 一级行政执法员”有结果', r1.length > 0, `count=${r1.length}`)
assert('结果同时含“税务局”和“一级行政执法员”', r1.every(j => j.searchText.includes('税务局') && j.searchText.includes('一级行政执法员')))
const r2 = search({ keyword: '中央办公厅' })
assert('“中央办公厅”有结果', r2.length > 0, `count=${r2.length}`)

console.log('== 6. 检索：代码（精确/前缀/组合） ==')
// 取一个真实职位代码
const sample = jobs.find(j => j.posCodes.length && j.series.length >= 3)
const pc = sample.posCodes[0]
const r3 = search({ posCode: pc })
assert(`职位代码精确检索 ${pc} 命中`, r3.some(j => j.id === sample.id))
const r4 = search({ posCode: pc.slice(0, 6) })
assert(`职位代码前缀 ${pc.slice(0,6)} 命中`, r4.length >= r3.length)
const dc = sample.deptCodes[0]
const r5 = search({ deptCode: dc })
assert(`部门代码检索 ${dc} 命中`, r5.some(j => j.id === sample.id), `count=${r5.length}`)

console.log('== 7. 年份筛选 ==')
const r6 = search({ keyword: '税务', years: [2026] })
assert('年份=2026 的结果都覆盖 2026', r6.every(j => j.years.includes(2026)), `count=${r6.length}`)
const r7 = search({ keyword: '税务', years: [2019] })
assert('年份=2019 的结果都覆盖 2019', r7.every(j => j.years.includes(2019)), `count=${r7.length}`)

console.log('== 8. 跨年趋势样例（人工可读） ==')
const demo = jobs.filter(j => j.series.length >= 6).slice(0, 2)
for (const j of demo) {
  console.log(`   [${j.department} / ${j.position}]`)
  console.log('     ' + j.series.map(p => `${p.year}:${p.score}`).join('  '))
}
const ambDemo = jobs.find(j => j.ambiguous.length > 0)
if (ambDemo) {
  console.log(`   [歧义样例] ${ambDemo.department} / ${ambDemo.position}`)
  for (const a of ambDemo.ambiguous.slice(0, 1)) {
    console.log(`     ${a.year} 年候选: ` + a.candidates.map(c => `${c.score}(职位码${c.posCode})`).join('  '))
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
