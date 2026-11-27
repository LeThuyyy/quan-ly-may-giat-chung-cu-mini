'use client';

import { FormEvent, useState } from 'react';
import Modal from '@/components/ui/Modal';

interface JoinBuildingModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onJoin: (token: string) => Promise<boolean>;
}

const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/;

export default function JoinBuildingModal({
  open,
  busy,
  onClose,
  onJoin,
}: JoinBuildingModalProps) {
  const [token, setToken] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = token.trim().toLowerCase();
    if (!cleaned) {
      setLocalError('Vui lòng nhập hoặc dán mã mời từ quản lý tòa nhà.');
      return;
    }
    if (!INVITE_TOKEN_RE.test(cleaned)) {
      setLocalError('Mã mời chưa đúng định dạng. Hãy dán đúng chuỗi mã mời gốc do quản lý gửi (không dùng mã ID hiển thị trong bảng).');
      return;
    }
    setLocalError(null);
    const ok = await onJoin(cleaned);
    if (ok) {
      setToken('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Tham gia tòa nhà"
      description="Nhập mã mời do quản lý tòa nhà chia sẻ. Sau khi gửi yêu cầu, quản lý sẽ phê duyệt quyền truy cập của bạn."
      size="sm"
    >
      <form className="ui-modal-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Mã mời tham gia</span>
          <input
            type="text"
            required
            value={token}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setToken(e.target.value);
              setLocalError(null);
            }}
            placeholder="Dán mã mời nhận được từ quản lý"
          />
          <span className="field-hint">
            Mã mời có hiệu lực 7 ngày và chỉ hiển thị cho quản lý ngay khi vừa tạo.
          </span>
        </label>

        {localError && (
          <p className="alert alert-error" role="alert">
            {localError}
          </p>
        )}

        <div className="ui-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang gửi...' : 'Gửi yêu cầu tham gia'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
