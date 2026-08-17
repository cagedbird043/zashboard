<script setup lang="ts">
import { useCalculateMaxProxies } from '@/composables/proxiesScroll'
import { handlerProxySelect } from '@/assembly/proxies'
import { computed } from 'vue'
import ProxyNodeCard from './ProxyNodeCard.vue'
import ProxyNodeGrid from './ProxyNodeGrid.vue'

const props = withDefaults(
  defineProps<{
    name: string
    now?: string
    renderProxies: string[]
    selectable?: boolean
  }>(),
  { selectable: true },
)

const { maxProxies } = useCalculateMaxProxies(
  props.renderProxies.length,
  props.renderProxies.indexOf(props.now ?? ''),
)
const proxies = computed(() => props.renderProxies.slice(0, maxProxies.value))
</script>

<template>
  <ProxyNodeGrid>
    <ProxyNodeCard
      v-for="node in proxies"
      :key="node"
      :name="node"
      :group-name="name"
      :active="node === now"
      :selectable="selectable"
      @click.stop="selectable && handlerProxySelect(name, node)"
    />
  </ProxyNodeGrid>
</template>
