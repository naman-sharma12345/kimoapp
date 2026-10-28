export const textStyles = {
  'caption-clean': {
    family: 'Geist',
    size: 56,
    weight: '500',
    position: 'bottom',
    stroke: true,
  },
  'caption-pop': {
    family: 'Anton',
    size: 72,
    weight: '400',
    position: 'bottom',
    uppercase: true,
  },
  'caption-box': {
    family: 'Geist',
    size: 48,
    weight: '500',
    position: 'bottom',
    box: true,
  },
  'title-serif': {
    family: 'Instrument Serif',
    size: 120,
    weight: '400',
    position: 'center',
    italic: true,
  },
  'title-bold': {
    family: 'Anton',
    size: 140,
    weight: '400',
    position: 'center',
  },
  'lower-third': {
    family: 'Geist',
    size: 40,
    weight: '500',
    position: 'bottom',
    box: true,
  },
  'label-mono': {
    family: 'Geist Mono',
    size: 32,
    weight: '400',
    position: 'bottom',
  },
  quote: {
    family: 'DM Serif Display',
    size: 64,
    weight: '400',
    position: 'center',
  },
} as const;
export type TextStyleId = keyof typeof textStyles;
export function textStyle(id: string) {
  if (id === 'caption') return textStyles['caption-clean'];
  if (id === 'title') return textStyles['title-serif'];
  return textStyles[id as TextStyleId] ?? textStyles['caption-clean'];
}

export const contentColors = [
  '#ffffff',
  '#000000',
  '#F5F1E7',
  '#FF5A24',
  '#FFD84D',
] as const;
