import { AlertCircleIcon, RefreshIcon } from '@/components/Icons';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
}

export default function ErrorState({
  title = 'Không thể tải dữ liệu',
  message,
  onRetry,
  retryLabel = 'Thử tải lại',
  busy = false,
}: ErrorStateProps) {
  return (
    <div className="ui-error-card" role="alert">
      <div className="ui-error-head">
        <span className="ui-error-icon" aria-hidden="true">
          <AlertCircleIcon size={20} />
        </span>
        <div>
          <h3 className="ui-error-title">{title}</h3>
          <p className="ui-error-msg">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onRetry}
          disabled={busy}
        >
          <RefreshIcon size={14} />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}
