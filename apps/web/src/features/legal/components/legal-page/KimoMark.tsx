import { KimoLogo } from '../../../brand/kimo-logo';

export interface KimoMarkProps {
  size?: 14 | 16 | 20 | 24;
  showWordmark?: boolean;
  className?: string;
}

export function KimoMark({
  size = 20,
  showWordmark = false,
  className = '',
}: KimoMarkProps) {
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap: 'var(--space-8)' }}
    >
      <KimoLogo size={size} />
      {showWordmark && (
        <span
          className="t-15"
          style={{
            color: 'var(--cream-100)',
            letterSpacing: '-0.02em',
            fontWeight: 500,
          }}
        >
          kimo
        </span>
      )}
    </span>
  );
}
