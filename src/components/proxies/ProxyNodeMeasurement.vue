<template>
  <ProbeReportBadge
    v-if="isProbeGroup"
    :name="name"
    :group-name="groupName!"
    :active="active"
  />
  <LatencyTag
    v-else
    :class="[compact && 'h-4! w-8! rounded-md!', 'shrink-0']"
    :name="name"
    :loading="loading"
    :group-name="groupName"
    @click.stop="measure"
  />
</template>

<script setup lang="ts">
import { getTestUrl, proxyGroupLatencyTest, proxyLatencyTest, proxyMap } from '@/assembly/proxies'
import { computed, ref } from 'vue'
import LatencyTag from './LatencyTag.vue'
import ProbeReportBadge from './singbox/ProbeReportBadge.vue'

const props = defineProps<{
  name: string
  groupName?: string
  active?: boolean
  compact: boolean
  afterMeasure?: () => void | Promise<void>
}>()
const isProbeGroup = computed(
  () => !!props.groupName && proxyMap.value[props.groupName]?.type.toLowerCase() === 'probe',
)
const loading = ref(false)
const measure = async () => {
  if (loading.value) return
  loading.value = true
  try {
    if (isProbeGroup.value) await proxyGroupLatencyTest(props.groupName!)
    else await proxyLatencyTest(props.name, getTestUrl(props.groupName))
  } catch {
    // Measurement errors are represented by the latency/probe result.
  } finally {
    loading.value = false
  }
  await props.afterMeasure?.()
}

defineExpose({ measure })
</script>
