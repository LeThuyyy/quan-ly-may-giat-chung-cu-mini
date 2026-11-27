'use client';

import { KeyboardEvent, useId, useState } from 'react';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
} from '@/components/Icons';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoComplete?: 'current-password' | 'new-password';
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
  showStrength?: boolean;
  name?: string;
}

interface StrengthInfo {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: 'weak' | 'fair' | 'good' | 'strong';
}

function evaluatePasswordStrength(password: string): StrengthInfo {
  if (!password) {
    return { score: 0, label: '', tone: 'weak' };
  }
  let checks = 0;
  if (password.length >= 12) checks += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) checks += 1;
  if (/\d/.test(password)) checks += 1;
  if (/[^a-zA-Z0-9\s]/.test(password)) checks += 1;

  if (password.length < 12) {
    return {
      score: 1,
      label: `Cần thêm ${12 - password.length} ký tự (tối thiểu 12 ký tự)`,
      tone: 'weak',
    };
  }
  if (checks <= 2) {
    return { score: 2, label: 'Độ mạnh: Trung bình — nên thêm số hoặc ký tự đặc biệt', tone: 'fair' };
  }
  if (checks === 3) {
    return { score: 3, label: 'Độ mạnh: Khá tốt', tone: 'good' };
  }
  return { score: 4, label: 'Độ mạnh: Rất mạnh', tone: 'strong' };
}

/**
 * Password field with visibility toggle, Caps Lock warning, and optional strength meter.
 */
export default function PasswordInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  autoComplete,
  minLength,
  maxLength = 128,
  required,
  disabled,
  hint,
  error,
  showStrength = false,
  name,
}: PasswordInputProps) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const capsId = capsLockOn ? `${inputId}-caps` : undefined;
  const strength = showStrength ? evaluatePasswordStrength(value) : null;
  const strengthId = showStrength && value ? `${inputId}-strength` : undefined;
  const describedBy = [errorId, capsId, strengthId, hintId].filter(Boolean).join(' ') || undefined;

  const handleKeyEvent = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  return (
    <div className={error ? 'auth-field auth-field-invalid' : 'auth-field'}>
      <label htmlFor={inputId} className="auth-label">
        {label}
      </label>
      <div className="input-wrap">
        <span className="input-icon" aria-hidden="true">
          <LockIcon size={17} />
        </span>
        <input
          id={inputId}
          name={name}
          type={visible ? 'text' : 'password'}
          className="auth-input has-icon has-action"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            setCapsLockOn(false);
            onBlur?.();
          }}
          onKeyDown={handleKeyEvent}
          onKeyUp={handleKeyEvent}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
        </button>
      </div>

      {capsLockOn && (
        <p id={capsId} className="caps-warning" role="status">
          <AlertTriangleIcon size={14} />
          <span>Đang bật Caps Lock</span>
        </p>
      )}

      {showStrength && strength && value.length > 0 && (
        <div id={strengthId} className="password-strength" aria-live="polite">
          <div className="strength-bars" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={
                  step <= strength.score
                    ? `strength-bar active tone-${strength.tone}`
                    : 'strength-bar'
                }
              />
            ))}
          </div>
          <span className={`strength-text tone-${strength.tone}`}>{strength.label}</span>
        </div>
      )}

      {error ? (
        <p id={errorId} className="field-error" role="alert">
          <AlertCircleIcon size={14} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
