<template>
  <DialogWrapper
    v-model="visible"
    no-padding
    :title="`${t('sameConnectionLogs')} (${connectionID})`"
  >
    <div class="bg-base-200 flex flex-col gap-2 p-2">
      <div v-for="log in connectionLogs" :key="log.seq" class="base-container">
        <LogsCard :log="log" connection-detail-disabled />
      </div>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { logs } from '@/assembly/logs'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import LogsCard from '@/components/logs/LogsCard.vue'
import { getLogConnectionID } from '@/store/logs'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const visible = ref(false)
const connectionID = ref('')
const connectionLogs = computed(() =>
  connectionID.value
    ? logs.value.filter((log) => getLogConnectionID(log.payload) === connectionID.value).reverse()
    : [],
)

const show = (id: string) => {
  connectionID.value = id
  visible.value = true
}
defineExpose({ show })
</script>
