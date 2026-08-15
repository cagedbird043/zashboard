import type { ConditionNode, TestProviderNode } from '@/api/config/types'
import {
  compileConditionNode,
  conditionItemToRegex,
  evaluateConditionNode,
} from '@/store/configDraft'
import { describe, expect, it } from 'vitest'

describe('ConditionBuilder & Draft Compilation', () => {
  it('compiles simple contains condition to case-insensitive regex', () => {
    const item = {
      field: 'name' as const,
      op: 'contains' as const,
      value: '香港|HK',
    }
    const regex = conditionItemToRegex(item)
    expect(regex).toBe('(?i)香港|HK')
  })

  it('compiles equals, starts_with, ends_with conditions accurately', () => {
    expect(conditionItemToRegex({ field: 'name', op: 'equals', value: 'HK-01' })).toBe('^HK-01$')
    expect(conditionItemToRegex({ field: 'name', op: 'starts_with', value: 'US' })).toBe('^US')
    expect(conditionItemToRegex({ field: 'name', op: 'ends_with', value: 'BGP' })).toBe('BGP$')
    expect(conditionItemToRegex({ field: 'name', op: 'regex', value: '(?i)tokyo.*cn2' })).toBe(
      '(?i)tokyo.*cn2',
    )
  })

  it('compiles ConditionNode with AND/OR/NOT logic', () => {
    const andNode: ConditionNode = {
      logic: 'and',
      conditions: [
        { field: 'name', op: 'contains', value: '香港' },
        { field: 'type', op: 'equals', value: 'shadowsocks' },
      ],
    }
    const andCompiled = compileConditionNode(andNode)
    expect(andCompiled.includes.length).toBe(2)
    expect(andCompiled.excludes.length).toBe(0)

    const notNode: ConditionNode = {
      logic: 'not',
      conditions: [{ field: 'name', op: 'contains', value: '官网' }],
    }
    const notCompiled = compileConditionNode(notNode)
    expect(notCompiled.includes.length).toBe(0)
    expect(notCompiled.excludes.length).toBe(1)
    expect(notCompiled.excludes[0]).toBe('(?i)官网')
  })

  it('evaluates live node matching correctly', () => {
    const nodeHK: TestProviderNode = {
      name: '🇭🇰 HK 01 (BGP Premium)',
      type: 'shadowsocks',
      region: 'HK',
      server: 'hk1.cagedbird.cn',
      port: 443,
    }

    const nodeUS: TestProviderNode = {
      name: '🇺🇸 US 01 (Los Angeles)',
      type: 'hysteria2',
      region: 'US',
      server: 'us1.cagedbird.cn',
      port: 443,
    }

    const hkFilter: ConditionNode = {
      logic: 'and',
      conditions: [{ field: 'name', op: 'contains', value: '香港|HK' }],
    }

    expect(evaluateConditionNode(nodeHK, hkFilter)).toBe(true)
    expect(evaluateConditionNode(nodeUS, hkFilter)).toBe(false)

    const notHysteriaFilter: ConditionNode = {
      logic: 'not',
      conditions: [{ field: 'type', op: 'equals', value: 'hysteria2' }],
    }

    expect(evaluateConditionNode(nodeHK, notHysteriaFilter)).toBe(true)
    expect(evaluateConditionNode(nodeUS, notHysteriaFilter)).toBe(false)
  })
})
