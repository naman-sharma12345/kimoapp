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

const gradeFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize; uniform vec4 uOutputFrame;
uniform float uExposure;uniform float uContrast;uniform float uSaturation;uniform float uTemperature;uniform float uTint;uniform float uCompare;
uniform vec3 uLift;uniform vec3 uGamma;uniform vec3 uGain;
void main(){vec4 original=texture(uTexture,vTextureCoord);vec3 rgb=original.a>0.0?original.rgb/original.a:vec3(0.0);rgb*=exp2(uExposure);rgb=(rgb-0.5)*uContrast+0.5;float luma=dot(rgb,vec3(0.2126,0.7152,0.0722));rgb=mix(vec3(luma),rgb,uSaturation);rgb*=vec3(1.0+0.15*uTemperature,1.0+0.1*uTint,1.0-0.15*uTemperature);rgb=pow(max((rgb+uLift)*uGain,vec3(0.0)),1.0/max(uGamma,vec3(0.01)));vec4 graded=vec4(clamp(rgb,0.0,1.0)*original.a,original.a);finalColor=uCompare>0.5&&vTextureCoord.x<0.5*uOutputFrame.z*uInputSize.z?original:graded;}
`;
export function gradeFilter(params: Record<string, unknown>) {
  const scalar = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const triple = (value: unknown, fallback: number) =>
    new Float32Array(
      Array.isArray(value)
        ? [
            scalar(value[0], fallback),
            scalar(value[1], fallback),
            scalar(value[2], fallback),
          ]
        : [fallback, fallback, fallback],
    );
  const preset = String(params.lut ?? 'none');
  return new Filter({
    glProgram: GlProgram.from({
      vertex,
      fragment: gradeFragment,
      name: 'kimo-grade',
    }),
    resources: {
      gradeUniforms: {
        uExposure: { value: scalar(params.exposure, 0), type: 'f32' },
        uContrast: {
          value: scalar(params.contrast, 1) * (preset === 'bleach' ? 1.3 : 1),
          type: 'f32',
        },
        uSaturation: {
          value:
            preset === 'mono'
              ? 0
              : scalar(params.saturation, 1) * (preset === 'bleach' ? 0.35 : 1),
          type: 'f32',
        },
        uTemperature: {
          value:
            scalar(params.temperature ?? params.warmth, 0) +
            (preset === 'warm film'
              ? 0.6
              : preset === 'teal & orange'
                ? 0.25
                : 0),
          type: 'f32',
        },
        uTint: { value: scalar(params.tint, 0), type: 'f32' },
        uCompare: { value: params.compare ? 1 : 0, type: 'f32' },
        uLift: { value: triple(params.lift, 0), type: 'vec3<f32>' },
        uGamma: { value: triple(params.gamma, 1), type: 'vec3<f32>' },
        uGain: { value: triple(params.gain, 1), type: 'vec3<f32>' },
      },
    },
  });
}
