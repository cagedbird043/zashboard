<template>
  <div
    class="h-full overflow-x-hidden overflow-y-auto"
    :style="padding"
  >
    <div class="flex flex-col gap-3 p-3">
      <!-- Top Control Plane Banner -->
      <section class="base-container relative overflow-hidden p-4 md:p-5">
        <div class="pointer-events-none absolute inset-0 opacity-80">
          <div
            class="bg-primary/10 absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl"
          ></div>
          <div
            class="bg-secondary/10 absolute -bottom-24 -left-16 h-56 w-56 rounded-full blur-3xl"
          ></div>
        </div>

        <div class="relative flex flex-wrap items-center justify-between gap-4">
          <!-- Left Branding & Info -->
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="border-primary/20 bg-primary/10 text-primary rounded-2xl border p-3"
              aria-hidden="true"
            >
              <CommandLineIcon class="h-6 w-6" />
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-base-content text-xl font-bold tracking-tight md:text-2xl">
                  {{ $t('configManager') }}
                </h1>
                <span
                  class="badge border font-mono font-bold"
                  :class="draftMeta.dirty ? 'badge-warning' : 'badge-success'"
                >
                  {{ draftMeta.dirty ? '草稿已修改 (Dirty)' : '已同步 (Synced)' }}
                </span>
                <span class="badge badge-neutral badge-sm font-mono">
                  分支: {{ draftMeta.branch || 'draft/cagedbird' }}
                </span>
              </div>
              <p class="text-base-content/60 mt-0.5 text-xs md:text-sm">
                零外部依赖 sing-box 模块化配置 IDE、Home Assistant 条件聚合与 GitOps 版本控制
              </p>
            </div>
          </div>

          <!-- Right Action Buttons -->
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="isLoading"
              @click="handleReload"
            >
              <span
                v-if="isLoading"
                class="loading loading-spinner loading-xs"
              ></span>
              <ArrowPathIcon
                v-else
                class="h-4 w-4"
              />
              重新加载
            </button>

            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="isSaving"
              @click="handleSave"
            >
              <span
                v-if="isSaving"
                class="loading loading-spinner loading-xs"
              ></span>
              <CloudArrowUpIcon
                v-else
                class="h-4 w-4"
              />
              保存草稿
            </button>

            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="activeTab = 'releases'"
            >
              <RocketLaunchIcon class="h-4 w-4" />
              发布管理
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div
          class="border-base-300/70 scrollbar-none relative mt-4 flex overflow-x-auto border-t pt-3"
        >
          <div class="tabs tabs-box bg-base-200/60 shrink-0 flex-nowrap p-1">
            <button
              v-for="tab in tabList"
              :key="tab.id"
              type="button"
              class="tab tab-sm gap-1.5 font-medium transition-all"
              :class="
                activeTab === tab.id ? 'tab-active font-semibold shadow-xs' : 'hover:text-primary'
              "
              @click="activeTab = tab.id"
            >
              <component
                :is="tab.icon"
                class="h-4 w-4"
              />
              <span>{{ tab.name }}</span>
              <span
                v-if="tab.badge !== undefined"
                class="badge badge-xs font-mono"
                :class="activeTab === tab.id ? 'badge-primary' : 'badge-ghost'"
              >
                {{ tab.badge }}
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- Active Tab Content View -->
      <section class="min-h-[600px]">
        <component :is="currentTabComponent" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePaddingForViews } from '@/composables/paddingViews'
import {
  draftMeta,
  draftState,
  isLoading,
  isSaving,
  loadDraft,
  saveDraft,
} from '@/store/configDraft'
import DnsView from '@/views/config/Dns.vue'
import GroupsView from '@/views/config/Groups.vue'
import InboundsView from '@/views/config/Inbounds.vue'
import JsoncEditorView from '@/views/config/JsoncEditor.vue'
import OverlaysView from '@/views/config/Overlays.vue'
import ProvidersView from '@/views/config/Providers.vue'
import ReleasesView from '@/views/config/Releases.vue'
import RoutesView from '@/views/config/Routes.vue'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsRightLeftIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CodeBracketSquareIcon,
  CommandLineIcon,
  RectangleStackIcon,
  RocketLaunchIcon,
  ServerStackIcon,
} from '@heroicons/vue/24/outline'
import { computed, onMounted, ref } from 'vue'

const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})

const activeTab = ref<string>('providers')

const tabList = computed(() => [
  {
    id: 'providers',
    name: '订阅源 (Providers)',
    icon: CloudArrowDownIcon,
    badge: draftState.providers?.length || 0,
    component: ProvidersView,
  },
  {
    id: 'groups',
    name: '出站策略组 (Groups)',
    icon: RectangleStackIcon,
    badge: draftState.groups?.length || 0,
    component: GroupsView,
  },
  {
    id: 'routes',
    name: '路由分流 (Routes)',
    icon: ArrowsRightLeftIcon,
    badge: draftState.routes?.rules?.length || 0,
    component: RoutesView,
  },
  {
    id: 'dns',
    name: 'DNS 引擎 (DNS)',
    icon: ServerStackIcon,
    badge: draftState.dns?.servers?.length || 0,
    component: DnsView,
  },
  {
    id: 'inbounds',
    name: '入站接口 (Inbounds)',
    icon: ArrowsPointingInIcon,
    badge: draftState.inbounds?.length || 0,
    component: InboundsView,
  },
  {
    id: 'overlays',
    name: '平台覆盖 (Overlays)',
    icon: AdjustmentsHorizontalIcon,
    component: OverlaysView,
  },
  {
    id: 'releases',
    name: '版本发布 (Releases)',
    icon: RocketLaunchIcon,
    component: ReleasesView,
  },
  {
    id: 'editor',
    name: '原始 JSONC (Editor)',
    icon: CodeBracketSquareIcon,
    component: JsoncEditorView,
  },
])

const currentTabComponent = computed(() => {
  const current = tabList.value.find((t) => t.id === activeTab.value)
  return current ? current.component : ProvidersView
})

onMounted(async () => {
  await loadDraft()
})

const handleReload = async () => {
  await loadDraft()
}

const handleSave = async () => {
  await saveDraft('Manual draft save from Config IDE')
}
</script>
