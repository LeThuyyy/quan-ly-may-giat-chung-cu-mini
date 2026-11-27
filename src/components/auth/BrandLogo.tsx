import { WasherIcon } from '@/components/Icons';

interface BrandLogoProps {
  subtitle?: string;
  size?: 'sm' | 'md';
}

/**
 * Consistent brand identity mark for Giặt chung cư.
 */
export default function BrandLogo({ subtitle, size = 'md' }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 18 : 22;
  return (
    <div className={size === 'sm' ? 'brand-lockup brand-lockup-sm' : 'brand-lockup'}>
      <span className="brand-mark" aria-hidden="true">
        <WasherIcon size={iconSize} />
      </span>
      <span className="brand-text">
        <span className="brand-name">Giặt chung cư</span>
        {subtitle && <span className="brand-tagline">{subtitle}</span>}
      </span>
    </div>
  );
}
