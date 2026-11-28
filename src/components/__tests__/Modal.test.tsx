// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
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

function NestedModals({ onOuterClose, initialInnerOpen = false }: { onOuterClose: () => void; initialInnerOpen?: boolean }) {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(initialInnerOpen);
  return (
    <>
      <button onClick={() => setOuterOpen(true)}>Mở hộp thoại</button>
      <Modal open={outerOpen} title="Hộp ngoài" onClose={() => { onOuterClose(); setOuterOpen(false); }}>
        <button onClick={() => setInnerOpen(true)}>Mở hộp trong</button>
        <Modal open={innerOpen} title="Hộp trong" onClose={() => setInnerOpen(false)}>
          <input aria-label="Nội dung bên trong" />
        </Modal>
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

  it('loops Tab from last to first and Shift+Tab from first to last, including footer links', () => {
    render(
      <Modal open title="Bàn phím" onClose={vi.fn()} footer={<a href="#save">Lưu</a>}>
        <input aria-label="Nội dung" />
        <button disabled>Không khả dụng</button>
        <button hidden>Ẩn</button>
        <button style={{ display: 'none' }}>Ẩn bằng CSS</button>
        <button tabIndex={-1}>Không theo Tab</button>
      </Modal>,
    );
    act(() => { vi.runOnlyPendingTimers(); });
    const first = screen.getByRole('button', { name: 'Đóng hộp thoại' });
    const last = screen.getByRole('link', { name: 'Lưu' });
    expect(document.activeElement).toBe(first);
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(first);
    // Normal movement within the dialog is still delegated to the browser.
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
    const input = screen.getByRole('textbox');
    input.focus();
    expect(fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })).toBe(true);
    const nonTabbable = screen.getByRole('button', { name: 'Không theo Tab' });
    nonTabbable.focus();
    expect(fireEvent.keyDown(nonTabbable, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(first);
  });

  it('focuses the dialog itself when no controls are available and traps either Tab direction', () => {
    render(<Modal open title="Đang tải" onClose={vi.fn()}><p>Vui lòng chờ</p></Modal>);
    // Model a dialog whose sole close control becomes unavailable while busy.
    screen.getByRole('button', { name: 'Đóng hộp thoại' }).setAttribute('disabled', '');
    act(() => { vi.runOnlyPendingTimers(); });
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    for (const shiftKey of [false, true]) {
      expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey })).toBe(false);
      expect(document.activeElement).toBe(dialog);
    }
  });

  it('recovers programmatic background focus immediately and blocks background keyboard handlers', () => {
    const onBackgroundKeyDown = vi.fn();
    const onBackgroundClick = vi.fn();
    render(
      <>
        <button onKeyDown={onBackgroundKeyDown} onClick={onBackgroundClick}>Nền</button>
        <Modal open title="Bảo vệ tiêu điểm" onClose={vi.fn()}><input aria-label="Trong hộp" /></Modal>
      </>,
    );
    act(() => { vi.runOnlyPendingTimers(); });
    const input = screen.getByRole('textbox');
    input.focus();
    const background = screen.getByRole('button', { name: 'Nền' });
    background.focus();
    expect(document.activeElement).toBe(input);
    for (const key of ['Enter', ' ', 'Tab']) {
      expect(fireEvent.keyDown(background, { key })).toBe(false);
      expect(document.activeElement).toBe(input);
    }
    expect(onBackgroundKeyDown).not.toHaveBeenCalled();
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });

  it('keeps only the nested dialog active and restores parent focus before the page opener', () => {
    const onOuterClose = vi.fn();
    document.body.style.overflow = 'auto';
    render(<NestedModals onOuterClose={onOuterClose} />);
    const opener = openModal();
    const innerOpener = screen.getByRole('button', { name: 'Mở hộp trong' });
    innerOpener.focus();
    fireEvent.click(innerOpener);
    act(() => { vi.runOnlyPendingTimers(); });
    const inner = screen.getByRole('dialog', { name: 'Hộp trong' });
    const first = within(inner).getByRole('button', { name: 'Đóng hộp thoại' });
    const last = within(inner).getByRole('textbox');
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    innerOpener.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Hộp trong' })).toBeNull();
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(innerOpener);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(innerOpener, { key: 'Escape' });
    expect(onOuterClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores page focus and scrolling when an entire open dialog tree unmounts', () => {
    function UnmountableDialogs({ show }: { show: boolean }) {
      const [open, setOpen] = useState(false);
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Mở hộp thoại</button>
          {show && (
            <Modal open={open} title="Hộp ngoài" onClose={vi.fn()}>
              <button onClick={() => setInnerOpen(true)}>Mở hộp trong</button>
              <Modal open={innerOpen} title="Hộp trong" onClose={vi.fn()}>Nội dung</Modal>
            </Modal>
          )}
        </>
      );
    }
    document.body.style.overflow = 'auto';
    const { rerender } = render(<UnmountableDialogs show />);
    const opener = openModal();
    const innerOpener = screen.getByRole('button', { name: 'Mở hộp trong' });
    innerOpener.focus();
    fireEvent.click(innerOpener);
    act(() => { vi.runOnlyPendingTimers(); });
    rerender(<UnmountableDialogs show={false} />);
    expect(document.body.style.overflow).toBe('auto');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('handles nested dialogs mounted together, including Strict Mode effect replays', () => {
    const onOuterClose = vi.fn();
    render(<StrictMode><NestedModals onOuterClose={onOuterClose} initialInnerOpen /></StrictMode>);
    const opener = screen.getByRole('button', { name: 'Mở hộp thoại' });
    opener.focus();
    fireEvent.click(opener);
    act(() => { vi.runOnlyPendingTimers(); });
    const inner = screen.getByRole('dialog', { name: 'Hộp trong' });
    expect(inner.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Hộp trong' })).toBeNull();
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Hộp ngoài' }).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });
});
