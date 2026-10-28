import { KimoLogo } from '../../../brand/kimo-logo';

export interface KimoMarkProps {
  size?: number;
  animatedMeter?: boolean;
  className?: string;
}

export function KimoMark({
  size = 20,
  animatedMeter = false,
  className,
}: KimoMarkProps) {
  return (
    <KimoLogo size={size} animated={animatedMeter} className={className} />
  );
}
