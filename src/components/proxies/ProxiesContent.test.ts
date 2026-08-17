/* @vitest-environment happy-dom */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProxiesContent from './ProxiesContent.vue'

const selectProxy = vi.hoisted(() => vi.fn())

vi.mock('@/assembly/proxies', () => ({
  handlerProxySelect: selectProxy,
}))

vi.mock('./ProxyNodeCard.vue', () => ({
  default: {
    props: ['name'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\', $event)">{{ name }}</button>',
  },
}))

vi.mock('./ProxyNodeGrid.vue', () => ({
  default: {
    template: '<div><slot /></div>',
  },
}))

vi.mock('@/composables/proxiesScroll', () => ({
  useCalculateMaxProxies: () => ({ maxProxies: { value: 10 } }),
}))

describe('ProxiesContent selection', () => {
  beforeEach(() => {
    selectProxy.mockClear()
  })

  it('selects nodes for selector groups by default', async () => {
    const wrapper = mount(ProxiesContent, {
      props: { name: 'selector', renderProxies: ['node'] },
    })

    await wrapper.get('button').trigger('click')

    expect(selectProxy).toHaveBeenCalledWith('selector', 'node')
  })

  it('does not select nodes in Provider cards', async () => {
    const wrapper = mount(ProxiesContent, {
      props: { name: 'provider', renderProxies: ['node'], selectable: false },
    })

    await wrapper.get('button').trigger('click')

    expect(selectProxy).not.toHaveBeenCalled()
  })
})
