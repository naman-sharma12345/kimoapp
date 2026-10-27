import { Filter, GlProgram } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uVignette;
uniform float uSharpen;
void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  if (uSharpen > 0.0) {
    vec2 d = uInputSize.zw;
    vec4 neighbors = texture(uTexture, vTextureCoord + vec2(d.x, 0.0)) + texture(uTexture, vTextureCoord - vec2(d.x, 0.0)) + texture(uTexture, vTextureCoord + vec2(0.0, d.y)) + texture(uTexture, vTextureCoord - vec2(0.0, d.y));
    color = clamp(color + uSharpen * (4.0 * color - neighbors), 0.0, 1.0);
  }
  vec2 size = max(uOutputFrame.zw * uInputSize.zw, vec2(0.00001));
  vec2 uv = vTextureCoord / size;
  float distanceFromCenter = length((uv - 0.5) * 1.41421356);
  color.rgb *= 1.0 - uVignette * smoothstep(0.3, 1.0, distanceFromCenter);
  finalColor = color;
}`;

export function detailFilter(vignette: number, sharpen: number) {
  return new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: 'kimo-detail' }),
    resources: {
      detailUniforms: {
        uVignette: { value: Math.max(0, Math.min(1, vignette)), type: 'f32' },
        uSharpen: { value: Math.max(0, Math.min(2, sharpen)), type: 'f32' },
      },
    },
  });
}
