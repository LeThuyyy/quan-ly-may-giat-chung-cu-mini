'use client';

import { ReactNode } from 'react';
import Modal from '@/components/ui/Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}

/**
 * Confirmation dialog for destructive or role-changing operations.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  busy = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={variant === 'danger' ? 'btn btn-danger-solid' : 'btn btn-primary'}
            onClick={() => void onConfirm()}
            disabled={busy || confirmDisabled}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
