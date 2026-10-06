import { describe, expect, it } from 'vitest'
import { sortEmployeeCandidates } from './personnel-order'

describe('sortEmployeeCandidates', () => {
  it('orders Supervisor then Foreman, then unknown/missing Level by Name', () => {
    expect(sortEmployeeCandidates([
      { personId: '4', name: 'Zeta Unknown', level: 'Contractor' },
      { personId: '3', name: 'Alpha Unknown' },
      { personId: '2', name: 'Foreman B', level: 'Foreman' },
      { personId: '1', name: 'Supervisor A', level: 'Supervisor' },
    ]).map((person) => person.name)).toEqual([
      'Supervisor A',
      'Foreman B',
      'Alpha Unknown',
      'Zeta Unknown',
    ])
  })
})
