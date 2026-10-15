// 历年分数线折线图：X=考试年份，Y=最低进面分数线。
// - 缺失年份断点展示（connectNulls=false），不补造数据
// - 歧义年份以散点并列展示全部候选，不强行连线
// - 悬停查看详情、年份范围筛选(dataZoom)、导出图片(toolbox)
import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Job } from '../types'
import { fmtScore } from '../utils/format'

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  MarkLineComponent,
  CanvasRenderer,
])

interface Props {
  job: Job
}

export default function TrendChart({ job }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const option = useMemo(() => {
    const yearsAll = job.years
    if (yearsAll.length === 0) return null
    const minY = yearsAll[0]
    const maxY = yearsAll[yearsAll.length - 1]
    const axisYears: number[] = []
    for (let y = minY; y <= maxY; y++) axisYears.push(y)

    const seriesMap = new Map(job.series.map((p) => [p.year, p]))
    const ambMap = new Map(job.ambiguous.map((p) => [p.year, p]))

    // 主折线：唯一确定点；缺失/歧义年份为 null（断点）
    const lineData = axisYears.map((y) => {
      const p = seriesMap.get(y)
      return p && p.score !== null ? p.score : null
    })

    // 歧义散点：每个候选一个点
    const scatterData: Array<[number, number]> = []
    for (const [y, ap] of ambMap) {
      for (const c of ap.candidates) {
        if (c.score !== null) scatterData.push([y, c.score])
      }
    }

    const scores = [
      ...job.series.map((p) => p.score),
      ...job.ambiguous.flatMap((a) => a.candidates.map((c) => c.score)),
    ].filter((s): s is number => s !== null)
    const lo = scores.length ? Math.floor(Math.min(...scores) - 3) : 0
    const hi = scores.length ? Math.ceil(Math.max(...scores) + 3) : 150

    return {
      grid: { left: 48, right: 20, top: 40, bottom: 56 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (params: any) => {
          const year = Array.isArray(params) ? params[0]?.axisValue : params.axisValue
          const yNum = Number(year)
          const parts: string[] = [`<b>${year} 年</b>`]
          const p = seriesMap.get(yNum)
          if (p) {
            parts.push(
              `进面分数线：<b>${fmtScore(p.score)}</b><br/>` +
                `部门代码 ${p.deptCode} / 职位代码 ${p.posCode}`,
            )
          }
          const ap = ambMap.get(yNum)
          if (ap) {
            parts.push(
              `<span style="color:#d97706">该年同名多岗（${ap.candidates.length}个），需结合代码区分：</span>`,
            )
            ap.candidates.forEach((c) => {
              parts.push(`· ${fmtScore(c.score)}（职位代码 ${c.posCode}）`)
            })
          }
          if (!p && !ap) parts.push('<span style="color:#94a3b8">该年无数据</span>')
          return parts.join('<br/>')
        },
      },
      legend: { data: ['进面分数线', '同名多岗候选'], top: 8, right: 10 },
      xAxis: {
        type: 'category',
        data: axisYears.map((y) => `${y}`),
        boundaryGap: false,
        axisLabel: { color: '#475569' },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'value',
        name: '分数',
        min: lo,
        max: hi,
        axisLabel: { color: '#475569' },
        splitLine: { lineStyle: { color: '#eef2f7' } },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, height: 18, bottom: 20 },
      ],
      toolbox: {
        right: 10,
        bottom: 0,
        feature: {
          saveAsImage: { title: '导出图片', name: `${job.department}-${job.position}-分数线趋势` },
        },
      },
      series: [
        {
          name: '进面分数线',
          type: 'line',
          data: lineData,
          connectNulls: false, // 缺失年份断点
          smooth: false,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2.5, color: '#2f6bf0' },
          itemStyle: { color: '#2f6bf0' },
          label: {
            show: true,
            position: 'top',
            color: '#1f52d6',
            fontSize: 11,
            formatter: (p: any) => (p.value == null ? '' : fmtScore(p.value)),
          },
        },
        {
          name: '同名多岗候选',
          type: 'scatter',
          data: scatterData,
          symbol: 'diamond',
          symbolSize: 10,
          itemStyle: { color: '#f59e0b' },
        },
      ],
    }
  }, [job])

  useEffect(() => {
    if (!ref.current) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current)
    }
    const chart = chartRef.current
    if (option) {
      chart.setOption(option as any, true)
    } else {
      chart.clear()
    }
  }, [option])

  useEffect(() => {
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return <div ref={ref} className="h-[360px] w-full" />
}
