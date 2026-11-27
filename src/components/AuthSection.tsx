'use client';

import { FormEvent, useRef, useState } from 'react';
import { AlertCircleIcon, BadgeIdIcon, UserIcon } from '@/components/Icons';
import AuthHero from '@/components/auth/AuthHero';
import BrandLogo from '@/components/auth/BrandLogo';
import FormField from '@/components/auth/FormField';
import PasswordInput from '@/components/auth/PasswordInput';

interface AuthSectionProps {
  busy: boolean;
  error?: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, displayName: string, password: string) => Promise<boolean>;
  onClearMessages: () => void;
}

type AuthMode = 'login' | 'register';
type FieldName = 'username' | 'displayName' | 'password' | 'confirmPassword';

const MIN_REGISTER_PASSWORD = 12;

export default function AuthSection({
  busy,
  error,
  onLogin,
  onRegister,
  onClearMessages,
}: AuthSectionProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const submittingRef = useRef(false);

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === authMode) return;
    setAuthMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setTouched({});
    setSubmitted(false);
    onClearMessages();
  };

  const markTouched = (field: FieldName) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const getFieldError = (field: FieldName): string | null => {
    const show = submitted || touched[field];
    if (!show) return null;

    if (field === 'username') {
      const trimmed = username.trim();
      if (!trimmed) return 'Vui lòng nhập tên đăng nhập.';
      if (trimmed.length > 80) return 'Tên đăng nhập tối đa 80 ký tự.';
    }

    if (field === 'displayName' && authMode === 'register') {
      const trimmed = displayName.trim();
      if (!trimmed) return 'Vui lòng nhập tên hiển thị.';
      if (trimmed.length > 80) return 'Tên hiển thị tối đa 80 ký tự.';
    }

    if (field === 'password') {
      if (!password) return 'Vui lòng nhập mật khẩu.';
      if (authMode === 'register' && password.length < MIN_REGISTER_PASSWORD) {
        return `Mật khẩu cần ít nhất ${MIN_REGISTER_PASSWORD} ký tự.`;
      }
      if (password.length > 128) return 'Mật khẩu tối đa 128 ký tự.';
    }

    if (field === 'confirmPassword' && authMode === 'register') {
      if (!confirmPassword) return 'Vui lòng xác nhận lại mật khẩu.';
      if (confirmPassword !== password) return 'Mật khẩu xác nhận không trùng khớp.';
    }

    return null;
  };

  const hasValidationErrors = () => {
    const trimmedUser = username.trim();
    if (!trimmedUser || trimmedUser.length > 80) return true;
    if (!password || password.length > 128) return true;
    if (authMode === 'register') {
      const trimmedDisplay = displayName.trim();
      if (!trimmedDisplay || trimmedDisplay.length > 80) return true;
      if (password.length < MIN_REGISTER_PASSWORD) return true;
      if (confirmPassword !== password) return true;
    }
    return false;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || submittingRef.current) return;

    setSubmitted(true);
    if (hasValidationErrors()) return;

    submittingRef.current = true;
    try {
      if (authMode === 'register') {
        const ok = await onRegister(username.trim(), displayName.trim(), password);
        if (ok) {
          setAuthMode('login');
          setPassword('');
          setConfirmPassword('');
          setTouched({});
          setSubmitted(false);
        }
        return;
      }

      await onLogin(username.trim(), password);
    } finally {
      submittingRef.current = false;
    }
  };

  const isRegister = authMode === 'register';

  return (
    <div className="auth-page">
      <div className="auth-mobile-brand">
        <BrandLogo size="sm" subtitle="Quản lý giặt chung cư" />
      </div>

      <section className="auth-split" aria-label="Xác thực tài khoản">
        <AuthHero />

        <div className="auth-form-column">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2 className="auth-card-title">
                {isRegister ? 'Tạo tài khoản cư dân' : 'Chào mừng trở lại'}
              </h2>
              <p className="auth-card-subtitle">
                {isRegister
                  ? 'Đăng ký tài khoản cá nhân để tham gia hàng đợi giặt chung của tòa nhà.'
                  : 'Đăng nhập để xem tình trạng máy giặt và giữ lượt nhanh chóng.'}
              </p>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Chế độ xác thực">
              <button
                type="button"
                role="tab"
                aria-selected={!isRegister}
                className={!isRegister ? 'auth-tab active' : 'auth-tab'}
                onClick={() => switchMode('login')}
                disabled={busy}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isRegister}
                className={isRegister ? 'auth-tab active' : 'auth-tab'}
                onClick={() => switchMode('register')}
                disabled={busy}
              >
                Đăng ký
              </button>
            </div>

            {error && (
              <div className="auth-alert-error" role="alert">
                <AlertCircleIcon size={17} />
                <span>{error}</span>
              </div>
            )}

            <form
              key={authMode}
              className="auth-form auth-form-animate"
              onSubmit={handleSubmit}
              noValidate
            >
              <FormField
                label="Tên đăng nhập"
                name="username"
                value={username}
                onChange={(val) => {
                  setUsername(val);
                  if (error) onClearMessages();
                }}
                onBlur={() => markTouched('username')}
                placeholder="vd: phong302"
                autoComplete="username"
                maxLength={80}
                required
                disabled={busy}
                spellCheck={false}
                icon={<UserIcon size={17} />}
                error={getFieldError('username')}
              />

              {isRegister && (
                <FormField
                  label="Tên hiển thị"
                  name="displayName"
                  value={displayName}
                  onChange={(val) => {
                    setDisplayName(val);
                    if (error) onClearMessages();
                  }}
                  onBlur={() => markTouched('displayName')}
                  placeholder="vd: Phòng 302 - An"
                  autoComplete="name"
                  maxLength={80}
                  required
                  disabled={busy}
                  icon={<BadgeIdIcon size={17} />}
                  hint="Tên hiển thị giúp cư dân cùng tòa nhận diện khi xếp hàng hoặc đổi lượt."
                  error={getFieldError('displayName')}
                />
              )}

              <PasswordInput
                label="Mật khẩu"
                name="password"
                value={password}
                onChange={(val) => {
                  setPassword(val);
                  if (error) onClearMessages();
                }}
                onBlur={() => markTouched('password')}
                placeholder={isRegister ? 'Tối thiểu 12 ký tự' : 'Nhập mật khẩu của bạn'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? MIN_REGISTER_PASSWORD : 1}
                maxLength={128}
                required
                disabled={busy}
                showStrength={isRegister}
                hint={
                  isRegister
                    ? 'Sử dụng ít nhất 12 ký tự, kết hợp chữ hoa, chữ thường, số hoặc ký tự đặc biệt.'
                    : undefined
                }
                error={getFieldError('password')}
              />

              {isRegister && (
                <PasswordInput
                  label="Xác nhận mật khẩu"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(val) => {
                    setConfirmPassword(val);
                    if (error) onClearMessages();
                  }}
                  onBlur={() => markTouched('confirmPassword')}
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
                  minLength={MIN_REGISTER_PASSWORD}
                  maxLength={128}
                  required
                  disabled={busy}
                  error={getFieldError('confirmPassword')}
                />
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={busy}
                aria-busy={busy}
              >
                {busy && <span className="btn-spinner" aria-hidden="true" />}
                <span>
                  {busy
                    ? isRegister
                      ? 'Đang tạo tài khoản...'
                      : 'Đang đăng nhập...'
                    : isRegister
                      ? 'Tạo tài khoản'
                      : 'Đăng nhập'}
                </span>
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="auth-footer">
        <span>Giặt chung cư · Hệ thống quản lý giặt chung cho tòa nhà</span>
      </footer>
    </div>
  );
}
