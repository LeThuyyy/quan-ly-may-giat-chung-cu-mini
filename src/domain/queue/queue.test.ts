import { describe, expect, it } from 'vitest';
import { proposeAssignments, type WaitingEntry } from './queue';

const time = new Date('2026-11-16T12:00:00.000Z');
const queue: WaitingEntry[] = [
  { id: 'a', accountId: 'account-a', position: 1, ready: true },
  { id: 'b', accountId: 'account-b', position: 2, ready: false },
  { id: 'c', accountId: 'account-c', position: 3, ready: true },
];

describe('proposeAssignments', () => {
  it('skips unready residents without mutating their position', () => {
    const proposal = proposeAssignments(queue, [
      { id: 'machine-2', assignable: true },
      { id: 'machine-1', assignable: true },
    ], time);

    expect(proposal.map(({ entryId, machineId }) => [entryId, machineId])).toEqual([
      ['a', 'machine-1'],
      ['c', 'machine-2'],
    ]);
    expect(queue[1]).toEqual({ id: 'b', accountId: 'account-b', position: 2, ready: false });
    expect(proposal[0].expiresAt.toISOString()).toBe('2026-11-16T12:08:00.000Z');
  });

  it('does not start a hold if nobody is ready', () => {
    expect(proposeAssignments([{ ...queue[1] }], [{ id: 'machine-1', assignable: true }], time)).toEqual([]);
  });

  it('ignores machines awaiting handoff or maintenance', () => {
    const result = proposeAssignments(queue, [{ id: 'machine-1', assignable: false }], time);
    expect(result).toEqual([]);
  });

  it('rejects duplicate accounts and queue positions', () => {
    expect(() => proposeAssignments([queue[0], { ...queue[1], accountId: 'account-a' }], [], time)).toThrow();
    expect(() => proposeAssignments([queue[0], { ...queue[1], position: 1 }], [], time)).toThrow();
  });
});
