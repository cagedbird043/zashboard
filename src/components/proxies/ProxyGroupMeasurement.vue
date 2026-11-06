<template>
  <ProbeGroupStatus
    v-if="proxyGroup.type.toLowerCase() === 'probe'"
    :name="name"
    :loading="loading"
    @screen="emit('measure')"
  />
  <LatencyTag
    v-else
    :class="['bg-base-200/40 hover:bg-base-200/70', latencyClass]"
    :loading="loading"
    :name="proxyGroup.now"
    :group-name="proxyGroup.name"
    @click.stop="emit('measure')"
  />
</template>

<script setup lang="ts">
import { proxyMap } from '@/assembly/proxies'
import { computed } from 'vue'
import LatencyTag from './LatencyTag.vue'
import ProbeGroupStatus from './singbox/ProbeGroupStatus.vue'

const props = defineProps<{ name: string; loading: boolean; latencyClass?: string }>()
const emit = defineEmits<{ measure: [] }>()
const proxyGroup = computed(() => proxyMap.value[props.name])
</script>
