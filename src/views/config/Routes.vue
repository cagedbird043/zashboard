<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-accent/20 bg-accent/10 text-accent rounded-2xl border p-3">
          <ArrowsRightLeftIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              路由分流规则 (Routing Rules)
            </h2>
            <span class="badge badge-accent badge-sm font-mono"> {{ rules.length }} 条规则 </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            按优先级自上而下匹配域名、IP-CIDR、GeoSite/GeoIP、端口及协议，执行路由/直连/拦截动作
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="openAddDrawer"
        >
          <PlusIcon class="h-4 w-4" />
          新建路由规则
        </button>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="base-container flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
      <div class="flex min-w-64 flex-1 items-center gap-2">
        <div class="relative w-full max-w-sm">
          <MagnifyingGlassIcon
            class="text-base-content/40 absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
          />
          <input
            v-model="searchQuery"
            type="text"
            class="input input-bordered input-xs w-full pl-8"
            placeholder="搜索规则 (域名, GeoSite, 出站, 备注...)"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="btn btn-xs"
          :class="actionFilter === 'all' ? 'btn-neutral' : 'btn-ghost'"
          @click="actionFilter = 'all'"
        >
          全部 ({{ rules.length }})
        </button>
        <button
          type="button"
          class="btn btn-xs"
          :class="actionFilter === 'route' ? 'btn-primary' : 'btn-ghost'"
          @click="actionFilter = 'route'"
        >
          路由 ({{ routeCount }})
        </button>
        <button
          type="button"
          class="btn btn-xs"
          :class="actionFilter === 'direct' ? 'btn-success' : 'btn-ghost'"
          @click="actionFilter = 'direct'"
        >
          直连 ({{ directCount }})
        </button>
        <button
          type="button"
          class="btn btn-xs"
          :class="actionFilter === 'reject' ? 'btn-error' : 'btn-ghost'"
          @click="actionFilter = 'reject'"
        >
          拦截 ({{ rejectCount }})
        </button>
      </div>
    </div>

    <!-- Draggable High-Density Rules List -->
    <div class="base-container overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table-sm table">
          <thead>
            <tr class="bg-base-200/50 text-base-content/70 text-xs">
              <th class="w-12">排序</th>
              <th class="w-16">状态</th>
              <th>匹配条件 (Criteria)</th>
              <th class="w-48">出站动作 (Action / Outbound)</th>
              <th>说明备注</th>
              <th class="w-28 text-right">操作</th>
            </tr>
          </thead>
          <Draggable
            v-model="rules"
            tag="tbody"
            :animation="150"
            ghost-class="opacity-50"
            handle=".drag-handle"
            item-key="id"
          >
            <template #item="{ element: r, index }">
              <tr
                v-if="matchesFilter(r)"
                class="hover:bg-base-200/30 cursor-pointer transition-colors"
                @click="openEditDrawer(r)"
              >
                <!-- Priority & Drag Handle -->
                <td>
                  <div
                    class="flex items-center gap-1.5"
                    @click.stop
                  >
                    <Bars3Icon
                      class="drag-handle text-base-content/40 hover:text-base-content h-4 w-4 shrink-0 cursor-move"
                    />
                    <span class="badge badge-ghost badge-xs font-mono font-bold">
                      #{{ index + 1 }}
                    </span>
                  </div>
                </td>

                <!-- Enabled Toggle -->
                <td @click.stop>
                  <input
                    v-model="r.enabled"
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                  />
                </td>

                <!-- Matching Criteria Badges -->
                <td>
                  <div class="flex flex-wrap items-center gap-1">
                    <!-- Invert Badge -->
                    <span
                      v-if="r.invert"
                      class="badge badge-warning badge-xs font-mono font-bold"
                    >
                      ! NOT
                    </span>

                    <!-- Geosite -->
                    <span
                      v-for="site in r.geosite || []"
                      :key="site"
                      class="badge badge-primary badge-outline badge-xs font-mono"
                    >
                      geosite:{{ site }}
                    </span>

                    <!-- Domain Suffix -->
                    <span
                      v-for="dom in r.domain_suffix || []"
                      :key="dom"
                      class="badge badge-secondary badge-outline badge-xs font-mono"
                    >
                      domain:*.{{ dom }}
                    </span>

                    <!-- GeoIP -->
                    <span
                      v-for="gip in r.geoip || []"
                      :key="gip"
                      class="badge badge-accent badge-outline badge-xs font-mono"
                    >
                      geoip:{{ gip }}
                    </span>

                    <!-- IP CIDR -->
                    <span
                      v-for="cidr in r.ip_cidr || []"
                      :key="cidr"
                      class="badge badge-neutral badge-outline badge-xs font-mono"
                    >
                      {{ cidr }}
                    </span>

                    <!-- Port -->
                    <span
                      v-if="r.port && r.port.length > 0"
                      class="badge badge-ghost badge-xs font-mono"
                    >
                      port:{{ r.port.join(',') }}
                    </span>

                    <!-- Protocol -->
                    <span
                      v-if="r.protocol && r.protocol.length > 0"
                      class="badge badge-ghost badge-xs font-mono"
                    >
                      proto:{{ r.protocol.join(',') }}
                    </span>

                    <!-- Rule Set -->
                    <span
                      v-for="rs in r.rule_set || []"
                      :key="rs"
                      class="badge badge-info badge-outline badge-xs font-mono"
                    >
                      rule-set:{{ rs }}
                    </span>

                    <!-- Process -->
                    <span
                      v-for="proc in r.process_name || []"
                      :key="proc"
                      class="badge badge-ghost badge-xs font-mono"
                    >
                      app:{{ proc }}
                    </span>
                  </div>
                </td>

                <!-- Target Outbound Action Badge -->
                <td>
                  <div class="flex items-center gap-1.5 text-xs font-medium">
                    <span
                      class="badge badge-sm font-mono font-bold"
                      :class="getActionBadgeClass(r.action)"
                    >
                      {{ r.action.toUpperCase() }}
                    </span>
                    <span
                      v-if="r.action === 'route' && r.outbound"
                      class="text-base-content truncate font-semibold"
                    >
                      ➔ {{ r.outbound }}
                    </span>
                  </div>
                </td>

                <!-- Description -->
                <td>
                  <span class="text-base-content/70 block max-w-xs truncate text-xs">
                    {{ r.description || '-' }}
                  </span>
                </td>

                <!-- Actions -->
                <td class="text-right">
                  <div
                    class="flex items-center justify-end gap-1"
                    @click.stop
                  >
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-primary"
                      title="编辑"
                      @click="openEditDrawer(r)"
                    >
                      <PencilSquareIcon class="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                      title="删除"
                      @click="deleteRule(r.id)"
                    >
                      <TrashIcon class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </Draggable>
        </table>
      </div>

      <div
        v-if="rules.length === 0"
        class="text-base-content/40 py-12 text-center text-xs"
      >
        暂无路由分流规则，点击上方 "新建路由规则" 开始配置
      </div>
    </div>

    <!-- Route Drawer Modal -->
    <RouteDrawer
      v-model="drawerOpen"
      :rule="selectedRule"
      @save="handleSaveRule"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigRoutes' })

import type { RouteRule } from '@/api/config/types'
import RouteDrawer from '@/components/config/RouteDrawer.vue'
import { showNotification } from '@/helper/notification'
import { draftState } from '@/store/configDraft'
import {
  ArrowsRightLeftIcon,
  Bars3Icon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import Draggable from 'vuedraggable'

const drawerOpen = ref(false)
const selectedRule = ref<RouteRule | null>(null)
const searchQuery = ref('')
const actionFilter = ref<'all' | 'route' | 'direct' | 'reject'>('all')

const rules = computed({
  get: () => draftState.routes.rules || [],
  set: (val: RouteRule[]) => {
    val.forEach((item, index) => {
      item.priority = index + 1
    })
    draftState.routes.rules = val
  },
})

const routeCount = computed(() => rules.value.filter((r) => r.action === 'route').length)
const directCount = computed(() => rules.value.filter((r) => r.action === 'direct').length)
const rejectCount = computed(() => rules.value.filter((r) => r.action === 'reject').length)

const getActionBadgeClass = (action: string) => {
  switch (action) {
    case 'route':
      return 'badge-primary'
    case 'direct':
      return 'badge-success'
    case 'reject':
      return 'badge-error'
    case 'sniff':
      return 'badge-info'
    default:
      return 'badge-ghost'
  }
}

const matchesFilter = (r: RouteRule): boolean => {
  if (actionFilter.value !== 'all' && r.action !== actionFilter.value) {
    return false
  }
  if (!searchQuery.value.trim()) return true
  const query = searchQuery.value.toLowerCase()

  const matchSite = (r.geosite || []).some((s) => s.toLowerCase().includes(query))
  const matchDomain = (r.domain_suffix || []).some((d) => d.toLowerCase().includes(query))
  const matchGeoip = (r.geoip || []).some((g) => g.toLowerCase().includes(query))
  const matchOutbound = (r.outbound || '').toLowerCase().includes(query)
  const matchDesc = (r.description || '').toLowerCase().includes(query)

  return matchSite || matchDomain || matchGeoip || matchOutbound || matchDesc
}

const openAddDrawer = () => {
  selectedRule.value = null
  drawerOpen.value = true
}

const openEditDrawer = (rule: RouteRule) => {
  selectedRule.value = rule
  drawerOpen.value = true
}

const handleSaveRule = (saved: RouteRule) => {
  const idx = draftState.routes.rules.findIndex((r) => r.id === saved.id)
  if (idx > -1) {
    draftState.routes.rules[idx] = saved
    showNotification({
      content: `Updated rule #${saved.priority}`,
      type: 'alert-success',
    })
  } else {
    draftState.routes.rules.push(saved)
    showNotification({
      content: `Added new rule #${saved.priority}`,
      type: 'alert-success',
    })
  }
}

const deleteRule = (id: string) => {
  const idx = draftState.routes.rules.findIndex((r) => r.id === id)
  if (idx > -1) {
    draftState.routes.rules.splice(idx, 1)
    draftState.routes.rules.forEach((item, index) => {
      item.priority = index + 1
    })
    showNotification({
      content: 'Rule deleted',
      type: 'alert-info',
    })
  }
}
</script>
