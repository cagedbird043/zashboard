import type { ProbeMeasureStats, ProbeReport } from '@/gen/daemon/started_service_pb'

// 展示用的主测量：优先下载型，其次第一个测量。
export const primaryMeasure = (report?: ProbeReport): ProbeMeasureStats | undefined =>
  report?.measures.find((measure) => measure.kind === 'download') ?? report?.measures[0]

// 节点卡片上的毫秒数：合格节点主测量的总耗时中位数；不合格或没有样本时为 0。
export const probeLatency = (report?: ProbeReport) => {
  const total = primaryMeasure(report)?.totalMs?.p50
  if (!report?.ok || !total) return 0
  return Math.max(1, Math.round(total))
}

export const formatRate = (bytesPerSecond: number) =>
  bytesPerSecond >= 1024 * 1024
    ? `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
    : `${Math.round(bytesPerSecond / 1024)} KB/s`

export const formatTime = (unixMilli: bigint) => new Date(Number(unixMilli)).toLocaleString()
