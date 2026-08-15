<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-primary/20 bg-primary/10 text-primary rounded-2xl border p-3">
          <CloudArrowDownIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              订阅源管理 (Subscription Providers)
            </h2>
            <span class="badge badge-primary badge-sm font-mono">
              {{ providers.length }} 个订阅源
            </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            管理上游机场/代理订阅 URL、自动解密解析、镜像加速分发与定时健康探测
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="isTestingAll"
          @click="testAllProviders"
        >
          <span
            v-if="isTestingAll"
            class="loading loading-spinner loading-xs"
          ></span>
          <BoltIcon
            v-else
            class="text-warning h-4 w-4"
          />
          测试全部节点
        </button>

        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="openAddDrawer"
        >
          <PlusIcon class="h-4 w-4" />
          添加订阅源
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">已启用订阅 (Active)</div>
        <div class="text-success mt-1 font-mono text-2xl font-bold">
          {{ activeProvidersCount }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">已解析节点总数 (Nodes)</div>
        <div class="text-primary mt-1 font-mono text-2xl font-bold">
          {{ totalNodesCount }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">镜像加速已配置 (Mirrors)</div>
        <div class="text-info mt-1 font-mono text-2xl font-bold">
          {{ mirrorConfiguredCount }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">健康检查探测中 (Probing)</div>
        <div class="text-secondary mt-1 font-mono text-2xl font-bold">
          {{ healthCheckCount }}
        </div>
      </div>
    </div>

    <!-- Providers High-Density Table / List -->
    <div class="base-container overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table-sm table">
          <thead>
            <tr class="bg-base-200/50 text-base-content/70 text-xs">
              <th>订阅名称 / 标识</th>
              <th>类型</th>
              <th>节点与区域分布</th>
              <th>上游地址 / 镜像加速</th>
              <th>更新周期</th>
              <th>健康探测</th>
              <th>状态</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-if="providers.length === 0"
              class="text-center"
            >
              <td
                colspan="8"
                class="text-base-content/40 py-8 text-xs"
              >
                暂无配置任何订阅源，点击右上角 "添加订阅源" 开始
              </td>
            </tr>

            <tr
              v-for="prov in providers"
              :key="prov.id"
              class="hover:bg-base-200/30 transition-colors"
            >
              <!-- Name & Tag -->
              <td>
                <div class="flex items-center gap-2">
                  <div class="text-base-content text-sm font-semibold">
                    {{ prov.name }}
                  </div>
                  <span
                    v-if="prov.proxy_prefix"
                    class="badge badge-ghost badge-xs font-mono"
                  >
                    前缀: {{ prov.proxy_prefix }}
                  </span>
                </div>
                <div class="text-base-content/50 font-mono text-[11px]">ID: {{ prov.id }}</div>
              </td>

              <!-- Type -->
              <td>
                <span class="badge badge-sm badge-outline font-mono uppercase">
                  {{ prov.type || 'remote' }}
                </span>
              </td>

              <!-- Node Count & Regions -->
              <td>
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-1.5 font-mono text-xs font-semibold">
                    <span class="badge badge-primary badge-xs">
                      {{ prov.node_count || 0 }} 节点
                    </span>
                  </div>
                  <div
                    v-if="prov.regions && Object.keys(prov.regions).length > 0"
                    class="flex flex-wrap gap-1"
                  >
                    <span
                      v-for="(count, reg) in prov.regions"
                      :key="reg"
                      class="badge badge-ghost badge-xs font-mono text-[10px]"
                    >
                      {{ reg }}: {{ count }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- URLs -->
              <td class="max-w-xs">
                <div class="flex flex-col gap-1 font-mono text-xs">
                  <!-- Primary URL -->
                  <div class="flex items-center gap-1">
                    <span class="badge badge-neutral badge-xs shrink-0">URL</span>
                    <span
                      class="text-base-content/80 truncate text-[11px]"
                      :title="prov.url"
                    >
                      {{ prov.url }}
                    </span>
                    <button
                      type="button"
                      class="text-base-content/40 hover:text-primary shrink-0"
                      @click="copyText(prov.url)"
                    >
                      <DocumentDuplicateIcon class="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <!-- Mirror URL -->
                  <div
                    v-if="prov.mirror_url"
                    class="flex items-center gap-1"
                  >
                    <span class="badge badge-info badge-xs shrink-0">Mirror</span>
                    <span
                      class="text-info truncate text-[11px]"
                      :title="prov.mirror_url"
                    >
                      {{ prov.mirror_url }}
                    </span>
                    <button
                      type="button"
                      class="text-base-content/40 hover:text-info shrink-0"
                      @click="copyText(prov.mirror_url)"
                    >
                      <DocumentDuplicateIcon class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </td>

              <!-- Interval -->
              <td>
                <span class="text-base-content/80 font-mono text-xs font-medium">
                  {{ prov.interval || '24h' }}
                </span>
              </td>

              <!-- Health Check -->
              <td>
                <div
                  v-if="prov.health_check?.enabled"
                  class="text-success flex items-center gap-1 text-xs"
                >
                  <HeartIcon class="h-3.5 w-3.5" />
                  <span class="font-mono text-[11px]">{{
                    prov.health_check.interval || '10m'
                  }}</span>
                </div>
                <span
                  v-else
                  class="text-base-content/40 text-[11px]"
                >
                  未开启
                </span>
              </td>

              <!-- Status Toggle -->
              <td>
                <input
                  v-model="prov.enabled"
                  type="checkbox"
                  class="toggle toggle-success toggle-sm"
                />
              </td>

              <!-- Actions -->
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-primary"
                    title="测试订阅"
                    @click="testSingleProvider(prov)"
                  >
                    <BoltIcon class="h-3.5 w-3.5" />
                    测试
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-base-content/70 hover:text-base-content"
                    title="编辑"
                    @click="openEditDrawer(prov)"
                  >
                    <PencilSquareIcon class="h-3.5 w-3.5" />
                    编辑
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                    title="删除"
                    @click="deleteProvider(prov.id)"
                  >
                    <TrashIcon class="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Provider Drawer Modal -->
    <ProviderDrawer
      v-model="drawerOpen"
      :provider="selectedProvider"
      @save="handleSaveProvider"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigProviders' })

import type { Provider } from '@/api/config/types'
import ProviderDrawer from '@/components/config/ProviderDrawer.vue'
import { showNotification } from '@/helper/notification'
import { draftState, testProvider } from '@/store/configDraft'
import {
  BoltIcon,
  CloudArrowDownIcon,
  DocumentDuplicateIcon,
  HeartIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'

const drawerOpen = ref(false)
const selectedProvider = ref<Provider | null>(null)
const isTestingAll = ref(false)

const providers = computed(() => draftState.providers || [])

const activeProvidersCount = computed(() => providers.value.filter((p) => p.enabled).length)

const totalNodesCount = computed(() =>
  providers.value.reduce((sum, p) => sum + (p.node_count || 0), 0),
)

const mirrorConfiguredCount = computed(
  () => providers.value.filter((p) => Boolean(p.mirror_url)).length,
)

const healthCheckCount = computed(
  () => providers.value.filter((p) => p.health_check?.enabled).length,
)

const openAddDrawer = () => {
  selectedProvider.value = null
  drawerOpen.value = true
}

const openEditDrawer = (prov: Provider) => {
  selectedProvider.value = prov
  drawerOpen.value = true
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showNotification({
      content: 'Copied to clipboard',
      type: 'alert-success',
    })
  } catch {
    showNotification({
      content: 'Failed to copy',
      type: 'alert-error',
    })
  }
}

const testSingleProvider = async (prov: Provider) => {
  try {
    const res = await testProvider(prov.url)
    prov.node_count = res.node_count
    prov.regions = res.regions
  } catch (err) {
    console.error(err)
  }
}

const testAllProviders = async () => {
  isTestingAll.value = true
  try {
    for (const prov of providers.value) {
      if (prov.enabled && prov.url) {
        try {
          const res = await testProvider(prov.url)
          prov.node_count = res.node_count
          prov.regions = res.regions
        } catch (err) {
          console.error(`Failed to test provider ${prov.name}`, err)
        }
      }
    }
    showNotification({
      content: 'All providers tested successfully',
      type: 'alert-success',
    })
  } finally {
    isTestingAll.value = false
  }
}

const handleSaveProvider = (saved: Provider) => {
  const idx = draftState.providers.findIndex((p) => p.id === saved.id)
  if (idx > -1) {
    draftState.providers[idx] = saved
    showNotification({
      content: `Updated provider: ${saved.name}`,
      type: 'alert-success',
    })
  } else {
    draftState.providers.push(saved)
    showNotification({
      content: `Added provider: ${saved.name}`,
      type: 'alert-success',
    })
  }
}

const deleteProvider = (id: string) => {
  const idx = draftState.providers.findIndex((p) => p.id === id)
  if (idx > -1) {
    const name = draftState.providers[idx].name
    draftState.providers.splice(idx, 1)
    showNotification({
      content: `Deleted provider: ${name}`,
      type: 'alert-info',
    })
  }
}
</script>
