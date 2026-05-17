<template>
  <div
    class="h-full overflow-x-hidden overflow-y-auto"
    :style="padding"
  >
    <div class="flex flex-col gap-3 p-3">
      <div class="base-container flex flex-col gap-3 p-4">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h1 class="text-xl font-semibold">{{ $t('tailnet') }}</h1>
            <p class="text-base-content/60 text-sm">{{ $t('tailnetDescription') }}</p>
          </div>
          <div class="flex-1"></div>
          <span
            v-if="status"
            class="badge border"
            :class="status.complete ? statusToneClass('success') : statusToneClass('warning')"
          >
            {{ status.complete ? $t('complete') : $t('partial') }}
          </span>
          <button
            class="btn btn-primary btn-sm"
            :disabled="loading"
            @click="fetchStatus"
          >
            <span
              v-if="loading"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ $t('refresh') }}
          </button>
        </div>

        <div class="text-base-content/50 text-xs">
          {{ $t('lastUpdated') }}:
          <span>{{ lastUpdated || $t('unknown') }}</span>
        </div>

        <div
          v-if="errorMessage"
          class="alert alert-error"
        >
          {{ errorMessage }}
        </div>
      </div>

      <div
        v-if="!loading && status?.endpoints.length === 0"
        class="base-container p-6 text-center"
      >
        <div class="text-base-content/70">{{ $t('noTailscaleEndpoints') }}</div>
      </div>

      <div
        v-for="endpoint in status?.endpoints"
        :key="endpoint.endpointTag"
        class="base-container flex flex-col gap-4 p-4"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-semibold">{{ endpoint.endpointTag }}</h2>
              <span
                class="badge badge-sm border"
                :class="backendStateClass(endpoint.backendState)"
              >
                {{ endpoint.backendState || $t('unknown') }}
              </span>
            </div>
            <div class="text-base-content/60 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span v-if="endpoint.networkName">
                {{ $t('tailnetNetwork') }}: {{ endpoint.networkName }}
              </span>
              <span v-if="endpoint.magicDNSSuffix">
                {{ $t('magicDNS') }}: {{ endpoint.magicDNSSuffix }}
              </span>
            </div>
          </div>
          <div class="flex-1"></div>
          <a
            v-if="endpoint.authURL"
            class="btn btn-outline btn-sm"
            :href="endpoint.authURL"
            target="_blank"
            rel="noreferrer"
          >
            {{ $t('login') }}
          </a>
        </div>

        <section>
          <h3 class="mb-2 font-medium">{{ $t('selfDevice') }}</h3>
          <PeerCard
            v-if="endpoint.self"
            :peer="endpoint.self"
            :endpoint-tag="endpoint.endpointTag"
            self-device
            :ping-state="pingStates[pingKey(endpoint.endpointTag, peerIPv4(endpoint.self))]"
            @copy="copyText"
            @ping="pingPeer"
          />
          <div
            v-else
            class="text-base-content/60 rounded-box bg-base-200/50 p-3 text-sm"
          >
            {{ $t('noSelfDevice') }}
          </div>
        </section>

        <section>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <h3 class="font-medium">{{ $t('peers') }}</h3>
            <span class="badge badge-sm">{{ flattenPeers(endpoint).length }}</span>
            <span
              class="badge badge-sm border"
              :class="statusToneClass('success')"
            >
              {{ $t('online') }} {{ onlinePeerCount(endpoint) }}
            </span>
          </div>
          <div
            v-if="flattenPeers(endpoint).length"
            class="grid grid-cols-1 gap-3 xl:grid-cols-2"
          >
            <PeerCard
              v-for="peer in flattenPeers(endpoint)"
              :key="`${endpoint.endpointTag}:${peer.dnsName || peer.hostName || peer.tailscaleIPs?.join(',')}`"
              :peer="peer"
              :endpoint-tag="endpoint.endpointTag"
              :ping-state="pingStates[pingKey(endpoint.endpointTag, peerIPv4(peer))]"
              @copy="copyText"
              @ping="pingPeer"
            />
          </div>
          <div
            v-else
            class="text-base-content/60 rounded-box bg-base-200/50 p-3 text-sm"
          >
            {{ $t('noPeers') }}
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { fetchTailscaleStatusAPI, startTailscalePingAPI } from '@/api'
import { usePaddingForViews } from '@/composables/paddingViews'
import { i18n } from '@/i18n'
import { showNotification } from '@/helper/notification'
import { prettyBytesHelper } from '@/helper/utils'
import type {
  TailscaleEndpointStatus,
  TailscalePeer,
  TailscalePingResponse,
  TailscaleStatusResponse,
} from '@/types'
import { computed, defineComponent, h, onMounted, onUnmounted, reactive, ref } from 'vue'

type PingState = {
  loading: boolean
  result?: TailscalePingResponse
  error?: string
}

type PeerWithGroup = TailscalePeer & {
  groupName?: string
}

const t = i18n.global.t
const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})

const status = ref<TailscaleStatusResponse>()
const loading = ref(false)
const errorMessage = ref('')
const lastUpdated = ref('')
const pingStates = reactive<Record<string, PingState>>({})
let refreshTimer: number | undefined

const peerIPv4 = (peer?: TailscalePeer) => {
  return peer?.tailscaleIPs?.find((ip) => !ip.includes(':')) || ''
}

const pingKey = (endpointTag: string, peerIP: string) => {
  return `${endpointTag}:${peerIP}`
}

const peerDisplayName = (peer: TailscalePeer) => {
  return peer.hostName || peer.dnsName || peerIPv4(peer) || peer.tailscaleIPs?.[0] || t('unknown')
}

const trimDNSName = (name?: string) => {
  return name?.replace(/\.$/, '') || ''
}

const statusToneClass = (tone: 'success' | 'warning' | 'neutral') => {
  switch (tone) {
    case 'success':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    default:
      return 'border-base-300 bg-base-200 text-base-content/80'
  }
}

const backendStateClass = (state?: string) => {
  switch (state) {
    case 'Running':
      return statusToneClass('success')
    case 'NeedsLogin':
    case 'NoState':
      return statusToneClass('warning')
    default:
      return statusToneClass('neutral')
  }
}

const peerStateClass = (peer: TailscalePeer) => {
  return peer.online || peer.active ? statusToneClass('success') : statusToneClass('neutral')
}

const fetchStatus = async () => {
  loading.value = true
  try {
    const { data } = await fetchTailscaleStatusAPI()
    status.value = {
      ...data,
      endpoints: data.endpoints || [],
    }
    errorMessage.value = ''
    lastUpdated.value = new Date().toLocaleTimeString()
    ensureRefreshTimer()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

const ensureRefreshTimer = () => {
  if (refreshTimer !== undefined) return
  refreshTimer = window.setInterval(fetchStatus, 5000)
}

const flattenPeers = (endpoint: TailscaleEndpointStatus): PeerWithGroup[] => {
  return (endpoint.userGroups || []).flatMap((group) => {
    const groupName = group.displayName || group.loginName
    return (group.peers || []).map((peer) => ({
      ...peer,
      groupName,
    }))
  })
}

const onlinePeerCount = (endpoint: TailscaleEndpointStatus) => {
  return flattenPeers(endpoint).filter((peer) => peer.online || peer.active).length
}

const copyText = async (text: string) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  showNotification({
    content: 'copySuccess',
    type: 'alert-success',
    timeout: 2000,
  })
}

const pingPeer = async (endpointTag: string, peerIP: string) => {
  if (!peerIP) return
  const key = pingKey(endpointTag, peerIP)
  pingStates[key] = {
    loading: true,
  }
  try {
    const { data } = await startTailscalePingAPI({
      endpointTag,
      peerIP,
    })
    pingStates[key] = {
      loading: false,
      result: data,
      error: data.error,
    }
  } catch (error) {
    pingStates[key] = {
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const PeerCard = defineComponent({
  props: {
    peer: {
      type: Object as () => PeerWithGroup,
      required: true,
    },
    endpointTag: {
      type: String,
      required: true,
    },
    selfDevice: {
      type: Boolean,
      default: false,
    },
    pingState: {
      type: Object as () => PingState | undefined,
      default: undefined,
    },
  },
  emits: ['copy', 'ping'],
  setup(props, { emit }) {
    const ipv4 = computed(() => peerIPv4(props.peer))
    const dnsName = computed(() => trimDNSName(props.peer.dnsName))
    const sshCommand = computed(() => (ipv4.value ? `ssh cagedbird@${ipv4.value}` : ''))
    const totalTraffic = computed(() => (props.peer.rxBytes || 0) + (props.peer.txBytes || 0))

    return () =>
      h('div', { class: 'rounded-box bg-base-200/50 flex flex-col gap-3 p-3 text-sm' }, [
        h('div', { class: 'flex flex-wrap items-start gap-2' }, [
          h('div', { class: 'min-w-0 flex-1' }, [
            h('div', { class: 'flex flex-wrap items-center gap-2' }, [
              h('span', { class: 'font-medium break-all' }, peerDisplayName(props.peer)),
              props.selfDevice
                ? h('span', { class: 'badge badge-primary badge-sm' }, t('selfDevice'))
                : null,
              h(
                'span',
                {
                  class: ['badge badge-sm border', peerStateClass(props.peer)],
                },
                props.peer.online || props.peer.active ? t('online') : t('offline'),
              ),
            ]),
            dnsName.value
              ? h('div', { class: 'text-base-content/60 mt-1 break-all' }, dnsName.value)
              : null,
            props.peer.groupName
              ? h(
                  'div',
                  { class: 'text-base-content/50 mt-1 break-all text-xs' },
                  props.peer.groupName,
                )
              : null,
          ]),
          props.peer.os
            ? h('span', { class: 'badge badge-outline badge-sm' }, props.peer.os)
            : null,
        ]),

        h(
          'div',
          { class: 'grid grid-cols-1 gap-2 md:grid-cols-2' },
          [
            ['IPv4', ipv4.value],
            ['DNS', dnsName.value],
            ['RX', props.peer.rxBytes ? prettyBytesHelper(props.peer.rxBytes) : ''],
            ['TX', props.peer.txBytes ? prettyBytesHelper(props.peer.txBytes) : ''],
            [t('total'), totalTraffic.value ? prettyBytesHelper(totalTraffic.value) : ''],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) =>
              h('div', { class: 'min-w-0' }, [
                h('div', { class: 'text-base-content/50 text-xs' }, label),
                h('div', { class: 'break-all tabular-nums' }, value),
              ]),
            ),
        ),

        h('div', { class: 'flex flex-wrap gap-2' }, [
          h(
            'button',
            {
              class: 'btn btn-xs',
              disabled: !ipv4.value,
              onClick: () => emit('copy', ipv4.value),
            },
            'IP',
          ),
          h(
            'button',
            {
              class: 'btn btn-xs',
              disabled: !dnsName.value,
              onClick: () => emit('copy', dnsName.value),
            },
            'DNS',
          ),
          h(
            'button',
            {
              class: 'btn btn-xs',
              disabled: !sshCommand.value,
              onClick: () => emit('copy', sshCommand.value),
            },
            'SSH',
          ),
          h(
            'button',
            {
              class: 'btn btn-xs btn-primary',
              disabled: !ipv4.value || props.pingState?.loading,
              onClick: () => emit('ping', props.endpointTag, ipv4.value),
            },
            props.pingState?.loading
              ? [h('span', { class: 'loading loading-spinner loading-xs' })]
              : 'Ping',
          ),
        ]),

        props.pingState?.result || props.pingState?.error
          ? h('div', { class: 'rounded-box bg-base-100/70 p-2 text-xs' }, [
              props.pingState.result
                ? h('div', { class: 'flex flex-wrap gap-x-4 gap-y-1' }, [
                    h(
                      'span',
                      `${props.pingState.result.latencyMs?.toFixed?.(2) ?? props.pingState.result.latencyMs} ms`,
                    ),
                    h('span', props.pingState.result.isDirect ? t('direct') : 'DERP'),
                    props.pingState.result.endpoint
                      ? h('span', { class: 'break-all' }, props.pingState.result.endpoint)
                      : null,
                    props.pingState.result.derpRegionCode
                      ? h('span', props.pingState.result.derpRegionCode)
                      : null,
                  ])
                : null,
              props.pingState.error
                ? h('div', { class: 'text-error mt-1 break-all' }, props.pingState.error)
                : null,
            ])
          : null,
      ])
  },
})

onMounted(fetchStatus)
onUnmounted(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
})
</script>
