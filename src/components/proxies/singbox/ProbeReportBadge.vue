<template>
  <span
    class="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1 rounded px-1.5 text-xs tabular-nums"
    :class="active ? 'text-primary-content' : report ? (report.ok ? 'text-success' : 'text-error') : 'text-base-content/50'"
    @mouseenter="showDetails"
    @click.stop="showDetails"
  >
    <span class="whitespace-nowrap">{{ report ? t(report.ok ? 'probePassed' : 'probeFailed') : t('probeUntested') }}</span>
    <template v-if="report && !report.error">
      <span class="whitespace-nowrap">· {{ report.firstByteMs }}ms</span>
      <span v-if="!probe?.url" class="whitespace-nowrap">· {{ report.ratio.toFixed(2) }}×</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { proxyMap } from '@/assembly/proxies'
import { useTooltip } from '@/composables/use-tooltip'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ name: string; groupName: string; active?: boolean }>()
const { t } = useI18n()
const { showTip } = useTooltip()
const probe = computed(() => proxyMap.value[props.groupName]?.probe)
const report = computed(() => probe.value?.reports[props.name])
const showDetails = (event: Event) => {
  const item = report.value
  if (!item) return showTip(event, t('probeUntested'))
  const lines = [t(item.ok ? 'probePassed' : 'probeFailed'), new Date(Number(item.time)).toLocaleString()]
  if (item.error) lines.push(item.error)
  else {
    lines.push(`${t('probeFirstByte')}: ${item.firstByteMs}ms`)
    if (!probe.value?.url) {
      lines.push(`${t('probeTransfer')}: ${item.transferMs}ms`, `${t('probeRatio')}: ${item.ratio.toFixed(2)} / ${probe.value?.maxRTTRatio}`)
    }
  }
  showTip(event, lines.join('\n'), { allowHTML: false })
}
</script>
