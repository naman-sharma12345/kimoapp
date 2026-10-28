import { KimoLogo } from '../../../brand/kimo-logo';

export interface KimoMarkProps {
  size?: number;
}

export function KimoMark({ size = 20 }: KimoMarkProps) {
  return <KimoLogo size={size} />;
}
