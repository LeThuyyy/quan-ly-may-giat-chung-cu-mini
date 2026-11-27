import { ClockIcon, QueueIcon, WasherIcon } from '@/components/Icons';

/**
 * Smart-living SVG washing machine illustration paired with clearly labeled
 * illustrative status cards (not live building data).
 */
export default function AuthIllustration() {
  return (
    <div className="auth-illustration" aria-hidden="true">
      <div className="auth-illustration-badge">Minh họa giao diện vận hành</div>

      <div className="auth-visual-stage">
        <svg
          className="washer-hero-svg"
          viewBox="0 0 220 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Soft floor shadow */}
          <ellipse cx="110" cy="204" rx="74" ry="8" fill="#084D3B" fillOpacity="0.1" />

          {/* Machine body */}
          <rect x="36" y="20" width="148" height="178" rx="20" fill="#FFFFFF" stroke="#B6D6C8" strokeWidth="2.5" />

          {/* Control panel strip */}
          <path d="M36 52H184" stroke="#DFE7E3" strokeWidth="2" />
          <rect x="52" y="31" width="38" height="12" rx="6" fill="#E3F4EC" stroke="#B6E0CC" strokeWidth="1.2" />
          <circle cx="144" cy="37" r="4.5" fill="#106B54" />
          <circle cx="158" cy="37" r="3.5" fill="#CBD5E1" />
          <circle cx="169" cy="37" r="3.5" fill="#16A34A" />

          {/* Outer drum ring */}
          <circle cx="110" cy="122" r="50" fill="#F5F8F7" stroke="#084D3B" strokeWidth="2.5" />
          <circle cx="110" cy="122" r="41" fill="#E6F4EE" stroke="#106B54" strokeWidth="1.75" />

          {/* Water wave inside drum */}
          <path
            d="M72 127C82 119 94 132 108 125C122 118 135 128 148 122C146 144 130 160 110 160C89 160 73 145 72 127Z"
            fill="#106B54"
            fillOpacity="0.18"
          />
          <path
            d="M74 128C85 121 96 132 110 125C124 118 135 128 146 123"
            stroke="#106B54"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Bubbles */}
          <circle cx="94" cy="108" r="4" fill="#FFFFFF" stroke="#106B54" strokeWidth="1.4" />
          <circle cx="122" cy="104" r="5.5" fill="#FFFFFF" stroke="#106B54" strokeWidth="1.4" />
          <circle cx="131" cy="117" r="2.8" fill="#106B54" fillOpacity="0.35" />
          <circle cx="88" cy="138" r="3" fill="#FFFFFF" fillOpacity="0.8" />

          {/* Door handle */}
          <rect x="151" y="114" width="6" height="16" rx="3" fill="#084D3B" />
        </svg>

        <div className="preview-card preview-card-top">
          <span className="preview-dot preview-dot-success" />
          <div>
            <div className="preview-title">
              <WasherIcon size={14} />
              <span>Máy 01 · Sẵn sàng</span>
            </div>
            <div className="preview-meta">Mô phỏng trạng thái</div>
          </div>
        </div>

        <div className="preview-card preview-card-bottom">
          <div className="preview-row">
            <span className="preview-chip">
              <QueueIcon size={13} />
              <span>2 người đang đợi</span>
            </span>
            <span className="preview-chip preview-chip-accent">
              <ClockIcon size={13} />
              <span>Giữ lượt 08:00</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
