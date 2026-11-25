import type { Mock } from 'vitest';

/** Compose the existing per-resource test fixtures into the new atomic endpoint contract.
 * Fixture failures remain failures, never an application fallback to split reads. */
export async function snapshotFixture(fetchMock: Mock, id: string): Promise<Response> {
  const root = `/api/buildings/${id}`;
  const responses: Response[] = await Promise.all([
    fetchMock('/api/buildings'), fetchMock(root), fetchMock(`${root}/queue/me`),
    fetchMock(`${root}/holds`), fetchMock(`${root}/wash-cycles/me`),
  ]);
  const failed = responses.find(response => !response.ok);
  if (failed) return failed;
  const [memberships, building, queueStatus, holds, myCycles] = await Promise.all(responses.map(r => r.json()));
  let previousCycle = null;
  if (queueStatus.state === 'HELD') {
    const handover: Response = await fetchMock(`${root}/holds/${queueStatus.holdId}/handover`);
    if (!handover.ok) return handover;
    previousCycle = await handover.json();
  }
  return new Response(JSON.stringify({ building, membership: memberships.find((m: {id:string}) => m.id === id),
    queueStatus, holds, myCycles, previousCycle, serverNow: queueStatus.serverNow ?? new Date().toISOString() }), { status: 200 });
}
