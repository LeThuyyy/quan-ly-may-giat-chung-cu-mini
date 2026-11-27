'use client';

import { FormEvent, useState } from 'react';
import Modal from '@/components/ui/Modal';

interface CreateBuildingModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, machineCount: number) => Promise<boolean>;
}

export default function CreateBuildingModal({
  open,
  busy,
  onClose,
  onCreate,
}: CreateBuildingModalProps) {
  const [name, setName] = useState('');
  const [machineCount, setMachineCount] = useState(2);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Vui lòng nhập tên tòa nhà.');
      return;
    }
    if (!Number.isInteger(machineCount) || machineCount < 1 || machineCount > 30) {
      setLocalError('Số lượng máy giặt phải từ 1 đến 30.');
      return;
    }
    setLocalError(null);
    const ok = await onCreate(trimmed, machineCount);
    if (ok) {
      setName('');
      setMachineCount(2);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Tạo tòa nhà mới"
      description="Bạn sẽ trở thành quản lý của tòa nhà mới và có thể tạo mã mời cho cư dân."
      size="sm"
    >
      <form className="ui-modal-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Tên tòa nhà</span>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
            }}
            placeholder="vd: Chung cư mini Hoa Hồng"
          />
        </label>

        <label className="field">
          <span>Số máy giặt ban đầu (1–30)</span>
          <input
            type="number"
            required
            min={1}
            max={30}
            value={machineCount}
            disabled={busy}
            onChange={(e) => {
              setMachineCount(Number(e.target.value));
              setLocalError(null);
            }}
          />
          <span className="field-hint">Bạn vẫn có thể thêm máy sau nếu tòa chưa đạt giới hạn 30 máy.</span>
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
            {busy ? 'Đang tạo...' : 'Tạo tòa nhà'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
