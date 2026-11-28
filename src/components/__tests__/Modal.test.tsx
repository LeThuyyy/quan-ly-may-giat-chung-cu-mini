// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from '../ui/Modal';

function ModalForm({ onClose }: { onClose: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Mở hộp thoại</button>
      <Modal
        open={open}
        title="Thêm máy giặt"
        onClose={() => {
          onClose(value);
          setOpen(false);
        }}
      >
        <label>
          Tên máy
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      </Modal>
    </>
  );
}

function openModal() {
  const opener = screen.getByRole('button', { name: 'Mở hộp thoại' });
  opener.focus();
  fireEvent.click(opener);
  act(() => { vi.runOnlyPendingTimers(); });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Đóng hộp thoại' }));
  return opener;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

describe('Modal', () => {
  it('keeps the input focused while typing rerenders a parent with an inline close callback', () => {
    const onClose = vi.fn();
    render(<ModalForm onClose={onClose} />);
    openModal();

    const input = screen.getByRole('textbox', { name: 'Tên máy' }) as HTMLInputElement;
    input.focus();

    for (const value of ['M', 'Má', 'Máy', 'Máy 1']) {
      fireEvent.change(input, { target: { value } });
      act(() => { vi.runOnlyPendingTimers(); });
      expect(input.value).toBe(value);
      expect(document.activeElement).toBe(input);
      expect(document.body.style.overflow).toBe('hidden');
    }
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the latest close callback on Escape and restores focus and scrolling on each close', () => {
    const onClose = vi.fn();
    document.body.style.overflow = 'auto';
    render(<ModalForm onClose={onClose} />);
    const opener = openModal();
    const input = screen.getByRole('textbox', { name: 'Tên máy' });
    input.focus();
    fireEvent.change(input, { target: { value: 'Máy 2' } });
    act(() => { vi.runOnlyPendingTimers(); });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledExactlyOnceWith('Máy 2');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('auto');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    openModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('auto');
  });

  it.each(['backdrop', 'close button'])('closes through the %s without closing on content clicks', (target) => {
    const onClose = vi.fn();
    render(<ModalForm onClose={onClose} />);
    const opener = openModal();
    const input = screen.getByRole('textbox', { name: 'Tên máy' });
    input.focus();
    fireEvent.change(input, { target: { value: 'Máy 3' } });
    act(() => { vi.runOnlyPendingTimers(); });
    fireEvent.mouseDown(input);
    expect(onClose).not.toHaveBeenCalled();

    if (target === 'backdrop') {
      fireEvent.mouseDown(screen.getByRole('presentation'));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Đóng hộp thoại' }));
    }

    expect(onClose).toHaveBeenCalledExactlyOnceWith('Máy 3');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });
});
