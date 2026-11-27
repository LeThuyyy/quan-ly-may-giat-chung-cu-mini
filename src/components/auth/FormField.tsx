'use client';

import { ReactNode, useId } from 'react';
import { AlertCircleIcon } from '@/components/Icons';

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: 'text';
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  spellCheck?: boolean;
  icon?: ReactNode;
  hint?: string;
  error?: string | null;
  name?: string;
}

/**
 * Accessible form input with leading icon, hint text, and inline error state.
 */
export default function FormField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  autoComplete,
  maxLength,
  required,
  disabled,
  spellCheck,
  icon,
  hint,
  error,
  name,
}: FormFieldProps) {
  const inputId = useId();
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={error ? 'auth-field auth-field-invalid' : 'auth-field'}>
      <label htmlFor={inputId} className="auth-label">
        {label}
      </label>
      <div className="input-wrap">
        {icon && (
          <span className="input-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          name={name}
          type={type}
          className={icon ? 'auth-input has-icon' : 'auth-input'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          spellCheck={spellCheck}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      </div>
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
