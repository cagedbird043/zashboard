import { describe, expect, it } from 'vitest'
import { failedSyncStage } from './zashboard-sync'

describe('Zashboard promotion failure reporting', () => {
  it('reports the earliest failed stage', () => {
    expect(failedSyncStage('failure', 'skipped', 'skipped')).toBe('prepare')
    expect(failedSyncStage('success', 'failure', 'skipped')).toBe('validate')
    expect(failedSyncStage('success', 'success', 'failure')).toBe('promote')
    expect(failedSyncStage('success', 'cancelled', 'skipped')).toBe('validate')
  })

  it('treats successful and intentionally skipped jobs as recovered', () => {
    expect(failedSyncStage('success', 'skipped', 'skipped')).toBeUndefined()
    expect(failedSyncStage('success', 'success', 'success')).toBeUndefined()
  })
})
