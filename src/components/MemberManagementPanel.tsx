'use client';

export interface PendingMember {
  id: string;
  displayName: string;
}

export interface BuildingMember {
  id: string;
  username: string;
  displayName: string;
  role: 'MANAGER' | 'RESIDENT';
  status: 'PENDING' | 'APPROVED';
}

interface MemberManagementPanelProps {
  currentAccountId: string;
  busy: boolean;
  inviteToken: string | null;
  pendingMembers: PendingMember[];
  approvedMembers: BuildingMember[];
  onCreateInvite: () => Promise<void>;
  onApproveMember: (accountId: string) => Promise<void>;
  onChangeRole: (accountId: string, role: 'MANAGER' | 'RESIDENT') => Promise<void>;
}

export default function MemberManagementPanel({
  currentAccountId,
  busy,
  inviteToken,
  pendingMembers,
  approvedMembers,
  onCreateInvite,
  onApproveMember,
  onChangeRole,
}: MemberManagementPanelProps) {
  const managerCount = approvedMembers.filter((m) => m.role === 'MANAGER').length;

  return (
    <div className="panel">
      <h3>Quản lý thành viên &amp; Phân quyền</h3>
      <div className="invite-box">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => void onCreateInvite()}
          disabled={busy}
        >
          Tạo mã mời 7 ngày
        </button>
        {inviteToken && (
          <div className="token-box">
            <code>{inviteToken}</code>
          </div>
        )}
      </div>

      <h4>Yêu cầu chờ duyệt ({pendingMembers.length})</h4>
      {pendingMembers.length === 0 ? (
        <p className="muted-note">Không có yêu cầu nào đang chờ duyệt.</p>
      ) : (
        <ul className="queue-list">
          {pendingMembers.map((m) => (
            <li key={m.id} className="queue-row">
              <span>{m.displayName}</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void onApproveMember(m.id)}
                disabled={busy}
              >
                Duyệt
              </button>
            </li>
          ))}
        </ul>
      )}

      <h4>Thành viên đã duyệt ({approvedMembers.length} · {managerCount} quản lý)</h4>
      {approvedMembers.length === 0 ? (
        <p className="muted-note">Chưa có thành viên nào được duyệt.</p>
      ) : (
        <ul className="queue-list">
          {approvedMembers.map((member) => {
            const isManager = member.role === 'MANAGER';
            const isLastManager = isManager && managerCount <= 1;
            const isMe = member.id === currentAccountId;

            return (
              <li key={member.id} className={isMe ? 'queue-row me' : 'queue-row'}>
                <span>
                  <strong>{member.displayName}</strong> (@{member.username}) ·{' '}
                  <span className={isManager ? 'pill pill-ready' : 'pill pill-wait'}>
                    {isManager ? 'Quản lý' : 'Cư dân'}
                  </span>
                </span>
                {isManager ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy || isLastManager}
                    title={isLastManager ? 'Không thể hạ quyền quản lý cuối cùng của tòa' : undefined}
                    onClick={() => void onChangeRole(member.id, 'RESIDENT')}
                  >
                    {isLastManager ? 'Quản lý duy nhất' : 'Hạ về Cư dân'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void onChangeRole(member.id, 'MANAGER')}
                  >
                    Cấp quyền Quản lý
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}