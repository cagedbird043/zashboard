<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-secondary/20 bg-secondary/10 text-secondary rounded-2xl border p-3">
          <AdjustmentsHorizontalIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              多平台与模式覆盖 (Platform Overlays)
            </h2>
            <span class="badge badge-secondary badge-sm font-mono"> 4 平台 × 2 模式 (8 组合) </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            查看基准配置继承树、字段覆盖溯源矩阵 (Origin Matrix) 并管理平台/模式差异化覆写
          </p>
        </div>
      </div>

      <!-- Platform & Variant Selectors -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="join">
          <button
            v-for="p in platforms"
            :key="p.id"
            type="button"
            class="btn btn-xs join-item font-mono font-medium"
            :class="activePlatform === p.id ? 'btn-primary' : 'btn-ghost'"
            @click="activePlatform = p.id"
          >
            {{ p.name }}
          </button>
        </div>

        <div class="join">
          <button
            type="button"
            class="btn btn-xs join-item font-mono"
            :class="activeVariant === 'fakeip' ? 'btn-secondary' : 'btn-ghost'"
            @click="activeVariant = 'fakeip'"
          >
            FakeIP
          </button>
          <button
            type="button"
            class="btn btn-xs join-item font-mono"
            :class="activeVariant === 'realip' ? 'btn-secondary' : 'btn-ghost'"
            @click="activeVariant = 'realip'"
          >
            RealIP
          </button>
        </div>
      </div>
    </div>

    <!-- Visual Inheritance Tree -->
    <div class="base-container p-4">
      <h3 class="text-base-content/70 mb-3 text-xs font-bold tracking-wider uppercase">
        配置继承流向图 (Inheritance Hierarchy)
      </h3>
      <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
        <div
          class="border-base-300 bg-base-200/60 flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <div class="bg-primary h-2 w-2 rounded-full"></div>
          <div>
            <div class="text-base-content font-bold">config/base.jsonc</div>
            <div class="text-base-content/50 text-[10px]">全局通用基准模板</div>
          </div>
        </div>

        <span class="text-primary font-bold">➔</span>

        <div
          class="border-primary/40 bg-primary/10 text-primary flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <div class="bg-primary h-2 w-2 animate-pulse rounded-full"></div>
          <div>
            <div class="font-bold">profiles/{{ activePlatform }}.jsonc</div>
            <div class="text-[10px] opacity-80">平台差异覆盖层 (Platform Overlay)</div>
          </div>
        </div>

        <span class="text-secondary font-bold">➔</span>

        <div
          class="border-secondary/40 bg-secondary/10 text-secondary flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <div class="bg-secondary h-2 w-2 rounded-full"></div>
          <div>
            <div class="font-bold uppercase">{{ activeVariant }}.jsonc</div>
            <div class="text-[10px] opacity-80">DNS / 模式变体 (Variant Mode)</div>
          </div>
        </div>

        <span class="text-success font-bold">➔</span>

        <div
          class="border-success/40 bg-success/10 text-success flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <div class="bg-success h-2 w-2 rounded-full"></div>
          <div>
            <div class="font-bold">final_{{ activePlatform }}_{{ activeVariant }}.jsonc</div>
            <div class="text-[10px] opacity-80">编译产物 (Release Target)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Field Origin Matrix & Overrides Editor Grid -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- Origin Matrix (Left) -->
      <div class="base-container flex flex-col p-4">
        <h3 class="text-base-content/70 mb-3 text-xs font-bold tracking-wider uppercase">
          字段来源追踪矩阵 (Field Origin Matrix)
        </h3>

        <div class="flex flex-col gap-2">
          <div
            v-for="sec in matrixSections"
            :key="sec.key"
            class="border-base-300/70 bg-base-200/30 flex items-center justify-between rounded-lg border p-3 text-xs"
          >
            <div class="flex items-center gap-2">
              <span class="text-base-content font-mono font-semibold">{{ sec.name }}</span>
              <span class="text-base-content/50 text-[11px]">{{ sec.desc }}</span>
            </div>

            <span
              class="badge badge-sm font-mono"
              :class="getOriginBadgeClass(sec.origin)"
            >
              {{ sec.originLabel }}
            </span>
          </div>
        </div>
      </div>

      <!-- Current Overlay Editor (Right) -->
      <div class="base-container flex flex-col p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base-content/70 text-xs font-bold tracking-wider uppercase">
            [{{ activePlatform.toUpperCase() }} - {{ activeVariant.toUpperCase() }}] 差异化覆写 JSON
          </h3>
          <button
            type="button"
            class="btn btn-primary btn-xs"
            @click="saveOverlay"
          >
            保存覆盖项
          </button>
        </div>

        <textarea
          v-model="overlayJsonText"
          class="textarea textarea-bordered bg-neutral text-neutral-content h-72 w-full font-mono text-xs leading-relaxed"
          placeholder='{ "inbounds": [] }'
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigOverlays' })

import type { PlatformType, VariantType } from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { draftState } from '@/store/configDraft'
import { AdjustmentsHorizontalIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'

const platforms: { id: PlatformType; name: string }[] = [
  { id: 'macos', name: 'macOS' },
  { id: 'linux', name: 'Linux' },
  { id: 'android', name: 'Android' },
  { id: 'rootless', name: 'Rootless (无Root模式)' },
]

const activePlatform = ref<PlatformType>('macos')
const activeVariant = ref<VariantType>('fakeip')
const overlayJsonText = ref('{}')

const matrixSections = computed(() => {
  const isFake = activeVariant.value === 'fakeip'
  const isRootless = activePlatform.value === 'rootless'

  return [
    {
      key: 'outbounds',
      name: 'outbounds (出站与订阅)',
      desc: '包含所有 Providers 与策略组',
      origin: 'base',
      originLabel: '基准继承 (Base)',
    },
    {
      key: 'route',
      name: 'route (分流规则与出口)',
      desc: 'Domain, GeoSite, IP-CIDR 路由规则',
      origin: 'base',
      originLabel: '基准继承 (Base)',
    },
    {
      key: 'inbounds',
      name: 'inbounds (TUN / 端口代理)',
      desc: isRootless ? '仅使用端口代理 127.0.0.1:7890' : '虚拟网卡与透明代理配置',
      origin: 'platform',
      originLabel: '平台覆盖 (Platform)',
    },
    {
      key: 'dns',
      name: 'dns (DNS 引擎与 FakeIP/RealIP)',
      desc: isFake ? '开启 FakeIP 198.18.0.0/15 地址池' : '直连真实 IP 解析',
      origin: 'variant',
      originLabel: '模式覆盖 (Variant)',
    },
    {
      key: 'experimental',
      name: 'experimental.clash_api (控制面板API)',
      desc: '零外部依赖 Clash API 监听',
      origin: 'platform',
      originLabel: '平台覆盖 (Platform)',
    },
  ]
})

const getOriginBadgeClass = (origin: string) => {
  switch (origin) {
    case 'base':
      return 'badge-ghost'
    case 'platform':
      return 'badge-primary'
    case 'variant':
      return 'badge-secondary'
    default:
      return 'badge-neutral'
  }
}

watch(
  [activePlatform, activeVariant],
  () => {
    const overlays = draftState.overlays || {}
    const pObj = (overlays[activePlatform.value] as Record<string, unknown>) || {}
    const current = pObj[activeVariant.value] || {}
    overlayJsonText.value = JSON.stringify(current, null, 2)
  },
  { immediate: true },
)

const saveOverlay = () => {
  try {
    const parsed = JSON.parse(overlayJsonText.value)
    if (!draftState.overlays) {
      draftState.overlays = {}
    }
    if (!draftState.overlays[activePlatform.value]) {
      draftState.overlays[activePlatform.value] = {}
    }
    const pObj = draftState.overlays[activePlatform.value] as Record<string, unknown>
    pObj[activeVariant.value] = parsed
    showNotification({
      content: `Saved overlay for ${activePlatform.value} (${activeVariant.value})`,
      type: 'alert-success',
    })
  } catch {
    showNotification({
      content: 'Invalid JSON in overlay editor',
      type: 'alert-error',
    })
  }
}
</script>
