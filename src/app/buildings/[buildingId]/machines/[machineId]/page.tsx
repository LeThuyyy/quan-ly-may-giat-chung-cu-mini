import MachineDetailPage from '@/components/MachineDetailPage';
import { isValidUuid } from '@/lib/route-helpers';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ buildingId: string; machineId: string }> }) {
  const { buildingId, machineId } = await params;
  if (!isValidUuid(buildingId) || !isValidUuid(machineId)) notFound();
  return <MachineDetailPage buildingId={buildingId} machineId={machineId} />;
}
