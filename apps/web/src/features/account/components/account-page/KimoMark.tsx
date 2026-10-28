import { KimoLogo } from '../../../brand/kimo-logo';

export interface KimoMarkProps {
  size?: number;
}

export function KimoMark({ size = 16 }: KimoMarkProps) {
  return <KimoLogo size={size} />;
}
