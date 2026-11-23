'use client';

import { FormEvent, useState } from 'react';

interface AuthSectionProps {
  busy: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, displayName: string, password: string) => Promise<boolean>;
  onClearMessages: () => void;
}

export default function AuthSection({
  busy,
  onLogin,
  onRegister,
  onClearMessages,
}: AuthSectionProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (authMode === 'register') {
      const ok = await onRegister(username, displayName, password);
      if (ok) {
        setAuthMode('login');
        setPassword('');
      }
      return;
    }
    await onLogin(username, password);
    setPassword('');
  };

  return (
    <section className="auth-grid">
      <div className="hero-compact">
        <p className="eyebrow">CHUNG MÁY · KHÔNG CHUNG NỖI LO</p>
        <h1>Hàng đợi giặt chung cho tòa nhà.</h1>
        <p className="lead">
          Đăng nhập bằng phiên bảo mật qua máy chủ Java. Tạo tòa (1–30 máy), mời cư dân, xếp hàng minh bạch và giữ lượt 8 phút.
        </p>
        <p className="muted-note">
          Lưu ý: Đóng trang hoặc tắt thông báo không tự gia hạn thời gian giữ lượt 8 phút.
        </p>
      </div>

      <form className="panel" onSubmit={handleSubmit}>
        <div className="tabs">
          <button
            type="button"
            className={authMode === 'login' ? 'tab active' : 'tab'}
            onClick={() => {
              setAuthMode('login');
              onClearMessages();
            }}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={authMode === 'register' ? 'tab active' : 'tab'}
            onClick={() => {
              setAuthMode('register');
              onClearMessages();
            }}
          >
            Đăng ký
          </button>
        </div>

        <label className="field">
          <span>Tên đăng nhập</span>
          <input
            type="text"
            required
            maxLength={80}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="vd: phong302"
            autoComplete="username"
          />
        </label>

        {authMode === 'register' && (
          <label className="field">
            <span>Tên hiển thị</span>
            <input
              type="text"
              required
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="vd: Phòng 302 - An"
            />
          </label>
        )}

        <label className="field">
          <span>Mật khẩu {authMode === 'register' ? '(tối thiểu 12 ký tự)' : ''}</span>
          <input
            type="password"
            required
            minLength={authMode === 'register' ? 12 : 1}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>
    </section>
  );
}