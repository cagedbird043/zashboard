<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity"
    @click.self="close"
  >
    <div
      class="border-base-300/80 bg-base-100 flex h-full w-full max-w-2xl flex-col border-l shadow-2xl transition-transform duration-300"
    >
      <!-- Header -->
      <div class="border-base-300/80 flex items-center justify-between border-b px-6 py-4">
        <div class="flex items-center gap-2">
          <div class="bg-primary/10 text-primary rounded-xl p-2">
            <CloudArrowDownIcon class="h-5 w-5" />
          </div>
          <div>
            <h3 class="text-base-content text-base font-semibold">
              {{ isEditing ? '编辑订阅源 (Edit Provider)' : '添加订阅源 (New Provider)' }}
            </h3>
            <p class="text-base-content/60 text-xs">
              配置远程订阅地址、镜像加速、前缀重命名与健康检查
            </p>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle"
          @click="close"
        >
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>

      <!-- Form Body -->
      <div class="flex-1 overflow-y-auto p-6">
        <form
          class="flex flex-col gap-4"
          @submit.prevent="save"
        >
          <!-- Name & Enabled -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="sm:col-span-2">
              <label class="label text-base-content/70 text-xs font-semibold">
                订阅名称 (Name) *
              </label>
              <input
                v-model="form.name"
                type="text"
                required
                class="input input-bordered input-sm w-full"
                placeholder="例: JustMySocks (CN2 GIA/BGP)"
              />
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                启用状态 (Status)
              </label>
              <div class="flex h-9 items-center gap-2">
                <input
                  v-model="form.enabled"
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                />
                <span class="text-xs">{{
                  form.enabled ? '已启用 (Active)' : '已停用 (Disabled)'
                }}</span>
              </div>
            </div>
          </div>

          <!-- Type & Prefix & Interval -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                订阅类型 (Type)
              </label>
              <select
                v-model="form.type"
                class="select select-bordered select-sm w-full"
              >
                <option value="remote">Remote (远程 URL)</option>
                <option value="local">Local (本地文件)</option>
                <option value="inline">Inline (内置节点)</option>
              </select>
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                节点前缀 (Prefix)
              </label>
              <input
                v-model="form.proxy_prefix"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="例: JMS / WW"
              />
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                更新间隔 (Interval)
              </label>
              <input
                v-model="form.interval"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="例: 24h / 12h"
              />
            </div>
          </div>

          <!-- Subscription URL -->
          <div>
            <div class="flex items-center justify-between">
              <label class="label text-base-content/70 text-xs font-semibold">
                上游订阅地址 (Primary URL) *
              </label>
              <button
                v-if="form.url"
                type="button"
                class="btn btn-ghost btn-xs text-primary"
                :disabled="isTesting"
                @click="testSubscription"
              >
                <span
                  v-if="isTesting"
                  class="loading loading-spinner loading-xs"
                ></span>
                <BoltIcon
                  v-else
                  class="h-3.5 w-3.5"
                />
                在线测速解析 (Test)
              </button>
            </div>
            <div class="relative">
              <input
                v-model="form.url"
                type="url"
                required
                class="input input-bordered input-sm w-full pr-8 font-mono text-xs"
                placeholder="https://ops.cagedbird.cn/sub/..."
              />
              <button
                v-if="form.url"
                type="button"
                class="text-base-content/40 hover:text-base-content absolute top-1/2 right-2 -translate-y-1/2"
                @click="copyToClipboard(form.url)"
              >
                <DocumentDuplicateIcon class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Mirror URL -->
          <div>
            <div class="flex items-center justify-between">
              <label class="label text-base-content/70 text-xs font-semibold">
                镜像加速地址 (Mirror URL)
              </label>
              <button
                type="button"
                class="btn btn-ghost btn-xs text-base-content/60 hover:text-primary"
                @click="resetMirrorUrl"
              >
                <ArrowPathIcon class="h-3 w-3" />
                重置为默认镜像 (Reset Mirror)
              </button>
            </div>
            <input
              v-model="form.mirror_url"
              type="url"
              class="input input-bordered input-sm w-full font-mono text-xs"
              placeholder="https://submirror.cagedbird.cn/..."
            />
          </div>

          <!-- Health Check Card -->
          <div
            v-if="form.health_check"
            class="rounded-box border-base-300/80 bg-base-200/40 border p-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <HeartIcon class="text-secondary h-4 w-4" />
                <span class="text-base-content text-xs font-semibold">
                  定时健康检查 (Health Check)
                </span>
              </div>
              <input
                v-model="form.health_check.enabled"
                type="checkbox"
                class="toggle toggle-secondary toggle-sm"
              />
            </div>
            <div
              v-if="form.health_check.enabled"
              class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div class="sm:col-span-2">
                <label class="label text-base-content/60 text-[11px]">测速地址 (URL)</label>
                <input
                  v-model="form.health_check.url"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="https://www.gstatic.com/generate_204"
                />
              </div>
              <div>
                <label class="label text-base-content/60 text-[11px]">检查周期 (Interval)</label>
                <input
                  v-model="form.health_check.interval"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="10m"
                />
              </div>
            </div>
          </div>

          <!-- Live Test Results Box -->
          <div
            v-if="testResult"
            class="rounded-box border-success/30 bg-success/5 border p-4 text-xs"
          >
            <div class="flex items-center justify-between">
              <div class="text-success flex items-center gap-2 font-semibold">
                <CheckCircleIcon class="h-4 w-4" />
                订阅解析成功 (Found {{ testResult.node_count }} nodes)
              </div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="(count, reg) in testResult.regions"
                  :key="reg"
                  class="badge badge-sm badge-outline font-mono"
                >
                  {{ reg }}: {{ count }}
                </span>
              </div>
            </div>

            <div
              class="border-base-300/50 bg-base-100/90 mt-3 max-h-36 overflow-y-auto rounded border p-2"
            >
              <div
                v-for="(node, idx) in testResult.nodes.slice(0, 15)"
                :key="idx"
                class="border-base-200/50 flex items-center justify-between border-b py-1 font-mono text-[11px] last:border-none"
              >
                <span class="truncate">{{ node.name }}</span>
                <span class="badge badge-ghost badge-xs">{{ node.type }}</span>
              </div>
              <div
                v-if="testResult.nodes.length > 15"
                class="text-base-content/40 pt-1 text-center text-[10px]"
              >
                ... 还有 {{ testResult.nodes.length - 15 }} 个节点未展示
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- Footer Actions -->
      <div class="border-base-300/80 flex items-center justify-end gap-2 border-t px-6 py-4">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="close"
        >
          取消 (Cancel)
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="save"
        >
          保存订阅 (Save Provider)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Provider, TestProviderResult } from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { testProvider } from '@/store/configDraft'
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  CloudArrowDownIcon,
  DocumentDuplicateIcon,
  HeartIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { reactive, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  provider?: Provider | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', provider: Provider): void
}>()

const isOpen = ref(false)
const isEditing = ref(false)
const isTesting = ref(false)
const testResult = ref<TestProviderResult | null>(null)

const form = reactive<
  Provider & { health_check: { enabled: boolean; url?: string; interval?: string } }
>({
  id: '',
  name: '',
  type: 'remote',
  url: '',
  mirror_url: '',
  interval: '24h',
  proxy_prefix: '',
  health_check: {
    enabled: true,
    url: 'https://www.gstatic.com/generate_204',
    interval: '10m',
  },
  enabled: true,
  node_count: 0,
})

watch(
  () => props.modelValue,
  (val) => {
    isOpen.value = val
    if (val) {
      testResult.value = null
      if (props.provider) {
        isEditing.value = true
        Object.assign(form, JSON.parse(JSON.stringify(props.provider)))
        if (!form.health_check) {
          form.health_check = {
            enabled: true,
            url: 'https://www.gstatic.com/generate_204',
            interval: '10m',
          }
        }
      } else {
        isEditing.value = false
        form.id = `prov_${Date.now()}`
        form.name = ''
        form.type = 'remote'
        form.url = ''
        form.mirror_url = ''
        form.interval = '24h'
        form.proxy_prefix = ''
        form.health_check = {
          enabled: true,
          url: 'https://www.gstatic.com/generate_204',
          interval: '10m',
        }
        form.enabled = true
        form.node_count = 0
      }
    }
  },
  { immediate: true },
)

const close = () => {
  isOpen.value = false
  emit('update:modelValue', false)
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showNotification({
      content: 'URL copied to clipboard',
      type: 'alert-success',
    })
  } catch {
    showNotification({
      content: 'Failed to copy URL',
      type: 'alert-error',
    })
  }
}

const resetMirrorUrl = () => {
  if (form.id.includes('jms')) {
    form.mirror_url = 'https://submirror.cagedbird.cn/jms'
  } else if (form.id.includes('wangwei')) {
    form.mirror_url = 'https://submirror.cagedbird.cn/wangwei'
  } else {
    form.mirror_url = form.url.replace('ops.cagedbird.cn', 'submirror.cagedbird.cn')
  }
  showNotification({
    content: 'Mirror URL reset to default',
    type: 'alert-info',
  })
}

const testSubscription = async () => {
  if (!form.url) return
  isTesting.value = true
  try {
    const res = await testProvider(form.url)
    testResult.value = res
    form.node_count = res.node_count
    form.regions = res.regions
  } catch (err) {
    console.error(err)
  } finally {
    isTesting.value = false
  }
}

const save = () => {
  if (!form.name || !form.url) {
    showNotification({
      content: 'Please fill in required fields (Name & URL)',
      type: 'alert-warning',
    })
    return
  }
  emit('save', JSON.parse(JSON.stringify(form)))
  close()
}
</script>
