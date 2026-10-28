import { KimoLogo } from '../../../brand/kimo-logo';

export type KimoMarkProps = {
  size?: number;
  showWordmark?: boolean;
};

export function KimoMark({ size = 16, showWordmark = true }: KimoMarkProps) {
  return (
    <span
      className="inline-flex items-center"
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
