import { notFound } from 'next/navigation';
import LaundryApp from '@/components/LaundryApp';
import { parseSlugToView } from '@/lib/navigation';
import { isValidUuid } from '@/lib/route-helpers';

export default async function BuildingSectionPage({
  params,
}: {
  params: Promise<{ buildingId: string; slug?: string[] }>;
}) {
  const { buildingId, slug } = await params;
  if (!isValidUuid(buildingId)) notFound();
  const initialView = parseSlugToView(slug);
  return <LaundryApp initialBuildingId={buildingId} initialView={initialView} />;
}
