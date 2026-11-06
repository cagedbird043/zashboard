<template>
  <button
    class="btn btn-xs z-10 h-auto min-h-7 shrink-0 py-1 font-normal"
    :class="probe?.error ? 'btn-warning' : 'btn-ghost bg-base-200/40'"
    :disabled="!probe || busy"
    :aria-label="t('probeRescreen')"
    @click.stop="emit('screen')"
    @mouseenter="showDetails"
  >
    <span v-if="busy" class="loading loading-spinner loading-xs" />
    {{ !probe ? t('probeUnsupported') : busy ? t('probeScreening') : t('probeRescreen') }}
  </button>
</template>

<script setup lang="ts">
import { proxyMap } from '@/assembly/proxies'
import { useTooltip } from '@/composables/use-tooltip'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ name: string; loading: boolean }>()
const emit = defineEmits<{ screen: [] }>()
const { t } = useI18n()
const { showTip } = useTooltip()
const probe = computed(() => proxyMap.value[props.name]?.probe)
const busy = computed(() => props.loading || probe.value?.running)
const showDetails = (event: Event) => {
  if (!probe.value) return showTip(event, t('probeUnsupported'))
  const info = probe.value
  const lines = [info.url || `${t('probeRatio')}: ≤ ${info.maxRTTRatio}`, t('probeKeepCurrent')]
  if (info.screenedAt > 0n) lines.push(`${t('probeLastScreen')}: ${new Date(Number(info.screenedAt)).toLocaleString()}`)
  if (info.error) lines.push(info.error)
  showTip(event, lines.join('\n'), { allowHTML: false })
}
</script>
