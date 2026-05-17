import { fetchTailscaleStatusAPI } from '@/api'
import type { TailscaleStatusResponse } from '@/types'
import TailnetPage from '@/views/TailnetPage.vue'
import { hasUsableTailnetStatus } from '@/views/tailnet'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  fetchTailscaleStatusAPI: vi.fn(),
  startTailscalePingAPI: vi.fn(),
}))

const fetchTailscaleStatusAPIMock = vi.mocked(fetchTailscaleStatusAPI)

const mountTailnetPage = () =>
  mount(TailnetPage, {
    global: {
      mocks: {
        $t: (key: string) => key,
      },
    },
  })

describe('TailnetPage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('treats Tailnet as usable only after the API returns at least one endpoint', () => {
    expect(hasUsableTailnetStatus()).toBe(false)
    expect(hasUsableTailnetStatus({ endpoints: [] })).toBe(false)
    expect(hasUsableTailnetStatus({ endpoints: [{ endpointTag: 'tailnet' }] })).toBe(true)
  })

  it('does not render the Tailnet dashboard when the backend API is absent', async () => {
    fetchTailscaleStatusAPIMock.mockRejectedValueOnce(new Error('tailnet api missing'))

    const wrapper = mountTailnetPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="tailnet-ready"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tailnet-endpoint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tailnet-unavailable"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('tailnet api missing')

    wrapper.unmount()
  })

  it('does not render the Tailnet dashboard when the API has no Tailscale endpoint', async () => {
    fetchTailscaleStatusAPIMock.mockResolvedValueOnce({
      data: {
        complete: true,
        endpoints: [],
      } satisfies TailscaleStatusResponse,
    })

    const wrapper = mountTailnetPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="tailnet-ready"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tailnet-endpoint"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tailnet-unavailable"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('renders the Tailnet dashboard only when the API returns a Tailscale endpoint', async () => {
    fetchTailscaleStatusAPIMock.mockResolvedValueOnce({
      data: {
        complete: true,
        endpoints: [
          {
            endpointTag: 'tailnet',
            backendState: 'Running',
            networkName: 'miceworld',
            magicDNSSuffix: 'tailnet.miceworld.top',
            self: {
              hostName: 'mice-laptop',
              online: true,
              tailscaleIPs: ['100.64.0.1'],
            },
            userGroups: [
              {
                displayName: 'devices',
                peers: [
                  {
                    hostName: 'mice-android',
                    online: true,
                    tailscaleIPs: ['100.64.0.3'],
                  },
                ],
              },
            ],
          },
        ],
      } satisfies TailscaleStatusResponse,
    })

    const wrapper = mountTailnetPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="tailnet-ready"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="tailnet-endpoint"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="tailnet-unavailable"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('mice-laptop')
    expect(wrapper.text()).toContain('mice-android')
    expect(wrapper.html()).not.toContain('badge-primary')

    wrapper.unmount()
  })
})
