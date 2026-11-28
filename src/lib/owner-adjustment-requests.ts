import { randomUuid } from './random-uuid';

// Only operation identities, never credentials. Module scope survives conditional card remounts.
const unresolved = new Map<string, { minutes: number; id: string }>();
export function ownerAdjustmentRequest(scope: string, minutes: number) {
  const previous = unresolved.get(scope);
  if (previous?.minutes === minutes) return previous;
  const request = { minutes, id: randomUuid() };
  unresolved.set(scope, request);
  return request;
}
export function resolveOwnerAdjustment(scope: string) { unresolved.delete(scope); }
