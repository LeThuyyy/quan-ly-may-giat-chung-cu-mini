// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthSection from '../AuthSection';

afterEach(() => {
  cleanup();
});

describe('AuthSection', () => {
  it('validates required login fields inline and submits trimmed credentials', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const onRegister = vi.fn().mockResolvedValue(true);
    const onClearMessages = vi.fn();

    render(
      <AuthSection
        busy={false}
        onLogin={onLogin}
        onRegister={onRegister}
        onClearMessages={onClearMessages}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByText('Vui lòng nhập tên đăng nhập.')).toBeTruthy();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: '  cudan1  ' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'MatKhauDemo123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('cudan1', 'MatKhauDemo123!');
    });
  });

  it('toggles password visibility with accessible button state', () => {
    render(
      <AuthSection
        busy={false}
        onLogin={vi.fn()}
        onRegister={vi.fn()}
        onClearMessages={vi.fn()}
      />,
    );

    const passwordInput = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggle = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    fireEvent.click(toggle);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('validates registration password length, strength meter, and confirmation match', async () => {
    const onRegister = vi.fn().mockResolvedValue(true);
    render(
      <AuthSection
        busy={false}
        onLogin={vi.fn()}
        onRegister={onRegister}
        onClearMessages={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Đăng ký' }));

    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'phong401' } });
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Phòng 401 - Lan' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: '12345678' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: '123456789' } });

    expect(screen.getByText('Cần thêm 4 ký tự (tối thiểu 12 ký tự)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(screen.getByText('Mật khẩu cần ít nhất 12 ký tự.')).toBeTruthy();
    expect(screen.getByText('Mật khẩu xác nhận không trùng khớp.')).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'MatKhauAnToan123!' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'MatKhauAnToan123!' } });
    expect(screen.getByText('Độ mạnh: Rất mạnh')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() => {
      expect(onRegister).toHaveBeenCalledWith('phong401', 'Phòng 401 - Lan', 'MatKhauAnToan123!');
    });
  });

  it('renders backend error alert inside the auth card and disables submit while busy', () => {
    render(
      <AuthSection
        busy={true}
        error="Sai tên đăng nhập hoặc mật khẩu"
        onLogin={vi.fn()}
        onRegister={vi.fn()}
        onClearMessages={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Sai tên đăng nhập hoặc mật khẩu');
    const submitBtn = screen.getByRole('button', { name: 'Đang đăng nhập...' }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });
});
