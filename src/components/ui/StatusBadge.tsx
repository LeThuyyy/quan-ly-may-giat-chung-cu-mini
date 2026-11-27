import { ReactNode } from 'react';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';

interface StatusBadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
}

/**
 * Accessible status pill pairing tone, border, and an optional icon/dot so
 * status is never conveyed by color alone.
 */
export default function StatusBadge({ tone, children, icon, dot = true }: StatusBadgeProps) {
  return (
    <span className={`ui-badge ui-badge-${tone}`}>
      {icon ? (
        <span className="ui-badge-icon" aria-hidden="true">{icon}</span>
      ) : dot ? (
        <span className="ui-badge-dot" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </span>
  );
}
