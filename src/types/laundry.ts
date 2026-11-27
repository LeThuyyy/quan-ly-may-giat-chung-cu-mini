import type { MachineHoldView } from '@/components/MachineHoldCard';
import type { QueueEntryView, QueueParticipation } from '@/components/QueuePanel';
import type { WashCycleView } from '@/components/WashCycleCard';
import type { QueueEstimateView } from '@/components/QueueEstimate';

export interface AccountView {
  id: string;
  username: string;
  displayName: string;
}

export interface BuildingSummary {
  id: string;
  name: string;
  role: 'MANAGER' | 'RESIDENT';
  status: 'PENDING' | 'APPROVED';
}

export interface MachineView {
  id: string;
  label: string;
  status: 'AVAILABLE' | 'MAINTENANCE' | 'RUNNING' | 'NEEDS_CHECK';
}

export interface BuildingView {
  id: string;
  name: string;
  machines: MachineView[];
  queue: QueueEntryView[];
}

export interface QueueMeResponse {
  state: QueueParticipation | string;
  queueEntryId: string | null;
  ready: boolean | null;
  holdId: string | null;
  machineId: string | null;
  expiresAt: string | null;
  serverNow: string;
}

export interface OperationalSnapshot {
  building: BuildingView;
  membership: BuildingSummary;
  queueStatus: QueueMeResponse;
  holds: MachineHoldView[];
  myCycles: WashCycleView[];
  previousCycle: WashCycleView | null;
  eta?: QueueEstimateView;
  serverNow: string;
}

export type AppView =
  | 'overview'
  | 'machines'
  | 'queue'
  | 'swaps'
  | 'chat'
  | 'admin-members'
  | 'admin-invitations'
  | 'admin-machines'
  | 'admin-activity'
  | 'admin-moderation'
  | 'account';
