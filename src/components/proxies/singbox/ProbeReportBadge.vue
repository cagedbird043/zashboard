<template>
  <span
    class="inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-1 rounded px-1.5 text-xs tabular-nums"
    :class="active ? 'text-primary-content' : tone"
    @mouseenter="showDetails"
    @click.stop="showDetails"
  >
    <span class="whitespace-nowrap">{{ status }}</span>
    <template v-if="report?.ok && measure">
      <span
        v-if="measure.totalMs"
        class="whitespace-nowrap"
        >· {{ Math.round(measure.totalMs.p50) }}ms</span
      >
      <span
        v-if="measure.kind === 'download' && measure.throughput"
        class="whitespace-nowrap"
      >
        · {{ formatRate(measure.throughput.p50) }}
      </span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { proxyMap } from '@/assembly/proxies'
import { useTooltip } from '@/composables/use-tooltip'
import { formatRate, formatTime, primaryMeasure } from '@/helper/probe'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ name: string; groupName: string; active?: boolean }>()
const { t } = useI18n()
const { showTip } = useTooltip()
const probe = computed(() => proxyMap.value[props.groupName]?.probe)
const report = computed(() => probe.value?.reports[props.name])
const measure = computed(() => primaryMeasure(report.value))
const penalized = computed(() => !!report.value && report.value.penaltyUntil > BigInt(Date.now()))
const status = computed(() => {
  const item = report.value
  if (!item || item.time === 0n) return t('probeUntested')
  if (!item.eligible) return t('probeIneligible')
  if (item.ok) return t('probePassed')
  return penalized.value ? t('probePenalized') : t('probeFailed')
})
const tone = computed(() => {
  const item = report.value
  if (!item || item.time === 0n || !item.eligible) return 'text-base-content/50'
  if (item.ok) return 'text-success'
  return penalized.value ? 'text-warning' : 'text-error'
})

const showDetails = (event: Event) => {
  const item = report.value
  if (!item) return showTip(event, t('probeUntested'))
  const lines = [status.value]
  if (item.time > 0n) lines.push(formatTime(item.time))
  if (item.error) lines.push(item.error)
  if (item.hasScore) lines.push(`${t('probeScore')}: ${Number(item.score.toPrecision(4))}`)
  if (penalized.value) lines.push(`${t('probePenaltyUntil')}: ${formatTime(item.penaltyUntil)}`)
  for (const stats of item.measures) {
    if (stats.count === 0) continue
    const parts = [
      `${stats.name} ${t('probeOkRate')} ${Math.round(stats.okRate * stats.count)}/${stats.count}`,
    ]
    if (stats.firstByteMs?.p50)
      parts.push(`${t('probeFirstByte')} ${Math.round(stats.firstByteMs.p50)}ms`)
    if (stats.kind === 'download' && stats.totalMs?.p50) {
      parts.push(`${t('probeTotal')} ${Math.round(stats.totalMs.p50)}ms`)
      if (stats.throughput)
        parts.push(`${t('probeThroughput')} ${formatRate(stats.throughput.p50)}`)
    }
    lines.push(parts.join(' · '))
    if (!stats.lastOk && stats.lastError) lines.push(`${stats.name}: ${stats.lastError}`)
  }
  const traffic = item.traffic
  if (traffic && traffic.conns > 0) {
    lines.push(
      `${t('probeTraffic')} ${traffic.conns} · ${t('probeFailRate')} ${traffic.dialFailed + traffic.aborted} (${Math.round(traffic.failRate * 100)}%)`,
    )
  }
  showTip(event, lines.join('\n'), { allowHTML: false })
}
</script>
