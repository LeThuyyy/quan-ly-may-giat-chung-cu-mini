export type WaitingEntry = Readonly<{
  id: string;
  accountId: string;
  position: number;
  ready: boolean;
}>;

export type MachineSlot = Readonly<{
  id: string;
  assignable: boolean;
}>;

export type Assignment = Readonly<{
  entryId: string;
  machineId: string;
  assignedAt: Date;
  expiresAt: Date;
}>;

/** Pure allocation proposal. The server must persist the result atomically per building. */
export function proposeAssignments(
  entries: readonly WaitingEntry[],
  machines: readonly MachineSlot[],
  assignedAt: Date,
  holdMinutes = 8,
): Assignment[] {
  if (!Number.isFinite(holdMinutes) || holdMinutes <= 0) {
    throw new RangeError('Hold duration must be positive');
  }
  if (!Number.isFinite(assignedAt.getTime())) {
    throw new RangeError('Assignment time must be valid');
  }
  const seenAccounts = new Set<string>();
  const seenPositions = new Set<number>();
  const seenEntries = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || !entry.accountId || !Number.isSafeInteger(entry.position)) {
      throw new RangeError('Queue entries require an id, account and integer position');
    }
    if (seenAccounts.has(entry.accountId) || seenEntries.has(entry.id) || seenPositions.has(entry.position)) {
      throw new RangeError('Queue contains duplicate account, entry or position');
    }
    seenAccounts.add(entry.accountId);
    seenEntries.add(entry.id);
    seenPositions.add(entry.position);
  }
  const seenMachines = new Set<string>();
  for (const machine of machines) {
    if (!machine.id || seenMachines.has(machine.id)) {
      throw new RangeError('Machines require unique ids');
    }
    seenMachines.add(machine.id);
  }

  const ready = entries.filter((entry) => entry.ready).sort((a, b) => a.position - b.position);
  const available = machines.filter((machine) => machine.assignable).sort((a, b) => a.id.localeCompare(b.id));
  const expiresAt = new Date(assignedAt.getTime() + holdMinutes * 60_000);
  return ready.slice(0, available.length).map((entry, index) => ({
    entryId: entry.id,
    machineId: available[index].id,
    assignedAt: new Date(assignedAt.getTime()),
    expiresAt: new Date(expiresAt.getTime()),
  }));
}
