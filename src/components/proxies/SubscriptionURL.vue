<template>
  <div
    v-if="url"
    class="flex min-w-0 items-center gap-2 text-xs"
    @click.stop
  >
    <span class="text-base-content/60 shrink-0">{{ $t('subscriptionURL') }}</span>
    <span class="min-w-0 flex-1 break-all select-text">{{ visible ? url : '••••••••' }}</span>
    <button
      class="btn btn-ghost btn-xs shrink-0"
      :aria-label="$t(visible ? 'hideSubscriptionURL' : 'showSubscriptionURL')"
      @click.stop="visible = !visible"
    >
      <component
        :is="visible ? EyeSlashIcon : EyeIcon"
        class="size-3.5"
      />
    </button>
    <button
      class="btn btn-ghost btn-xs shrink-0"
      :aria-label="$t('copy')"
      @click.stop="copyURL"
    >
      <ClipboardIcon class="size-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { showNotification } from '@/helper/notification'
import { notifyRequestError } from '@/helper/request-error'
import { ClipboardIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { ref, watch } from 'vue'

const props = defineProps<{ url?: string }>()
const visible = ref(false)
watch(
  () => props.url,
  () => {
    visible.value = false
  },
)

const copyURL = async () => {
  if (!props.url) return
  try {
    await navigator.clipboard.writeText(props.url)
    showNotification({ content: 'copySuccess', type: 'alert-success', timeout: 2000 })
  } catch (error) {
    notifyRequestError(error)
  }
}
</script>
