<template>
  <div
    :class="
      isLogTable
        ? 'relative flex size-full flex-col overflow-hidden'
        : 'relative size-full overflow-x-hidden'
    "
    :style="isLogTable ? padding : undefined"
  >
    <template v-if="isLogTable">
      <LogsCtrl />
      <LogsTable
        :logs="renderLogs"
        @connection-click="connectionLogsDialog?.show($event)"
      />
    </template>
    <VirtualScroller
      v-else
      :data="renderLogs"
      :size="44"
    >
      <template v-slot:before>
        <LogsCtrl />
      </template>
      <template v-slot="{ item }: { item: LogWithSeq }">
        <LogsCard
          :log="item"
          @connection-click="connectionLogsDialog?.show($event)"
        />
      </template>
    </VirtualScroller>
    <ConnectionLogsDialog ref="connectionLogsDialog" />
  </div>
</template>

<script setup lang="ts">
import { logs } from '@/assembly/logs'
import ConnectionLogsDialog from '@/components/singbox/ConnectionLogsDialog.vue'
import VirtualScroller from '@/components/common/VirtualScroller.vue'
import LogsCtrl from '@/components/controls/LogsCtrl.tsx'
import LogsCard from '@/components/logs/LogsCard.vue'
import LogsTable from '@/components/logs/LogsTable.vue'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { LIST_DISPLAY_STYLE } from '@/constant'
import { toSearchRegex } from '@/helper/search'
import {
  logFilter,
  logFilterEnabled,
  logFilterRegex,
  logTypeFilter,
} from '@/store/logs'
import { logDisplayStyle } from '@/store/settings'
import type { LogWithSeq } from '@/types'
import { computed, useTemplateRef } from 'vue'

const connectionLogsDialog = useTemplateRef('connectionLogsDialog')

const isLogTable = computed(() => logDisplayStyle.value === LIST_DISPLAY_STYLE.TABLE)
const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})

const renderLogs = computed(() => {
  let renderLogs = logs.value
  const searchRegex = toSearchRegex(logFilter.value)

  if (logFilter.value || logTypeFilter.value) {
    renderLogs = logs.value.filter((log) => {
      // 一律匹配剥离掉 ANSI 转义序列的可见文本,否则搜 "208" 会命中颜色码 38;5;208,
      // 而跨颜色码的连写又搜不到。
      if (searchRegex && !searchRegex.testAny([log.visiblePayload, log.time, log.type])) {
        return false
      }

      if (
        logTypeFilter.value &&
        !(log.visiblePayload.includes(logTypeFilter.value) || log.type === logTypeFilter.value)
      ) {
        return false
      }

      return true
    })
  }

  if (logFilterEnabled.value && logFilterRegex.value) {
    const hideRegex = toSearchRegex(logFilterRegex.value)

    if (hideRegex) {
      renderLogs = renderLogs.filter((log) => {
        return !hideRegex.testAny([log.visiblePayload, log.time, log.type])
      })
    }
  }

  return renderLogs
})

</script>
