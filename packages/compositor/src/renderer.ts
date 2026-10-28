import {
  Application,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Graphics,
  NoiseFilter,
  Sprite,
  Text,
  Texture,
  type Filter,
} from 'pixi.js';
import type { Asset, Clip, KimoProject } from '@kimo/client';
import { MediaPool } from './media-pool.ts';
import { buildScene, type SceneLayer } from './scene.ts';
import { textStyle } from './text-styles.ts';
import { detailFilter, gradeFilter } from './effects.ts';

type Node = {
  root: Container;
  display: Sprite | Text | Graphics;
  unfiltered: Sprite;
  crop: Graphics;
  background: Graphics;
  words: Container;
  maskSprite: Sprite;
  maskFeather: number;
  signature: string;
  filters: Filter[];
  approximate: boolean;
  imageShownAt?: number;
};
const supportedTransitions = new Set([
  'dissolve',
  'cross-dissolve',
  'crossfade',
  'dip-to-black',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'zoom-in',
]);
const number = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export class PixiRenderer {
  private app = new Application();
  private backdrop = new Graphics();
  private stage = new Container({ isRenderGroup: true });
  private nodes = new Map<string, Node>();
  private ready = false;
  private generation = 0;
  readonly media: MediaPool;
  approximate = false;
  constructor(
    private readonly invalidate: () => void,
    onVideo?: (video: HTMLVideoElement, clipId: string) => void,
    onVideoRemoved?: (clipId: string) => void,
  ) {
    this.media = new MediaPool(invalidate, onVideo, onVideoRemoved);
  }
  async mount(canvas: HTMLCanvasElement, width: number, height: number) {
    const generation = ++this.generation;
    await this.app.init({
      canvas,
      width,
      height,
      background: 0x000000,
      antialias: true,
      autoStart: false,
      preference: 'webgl',
      resolution: 1,
    });
    if (generation !== this.generation) {
      this.app.destroy({ removeView: false }, { children: true });
      return;
    }
    this.app.stage.addChild(this.backdrop, this.stage);
    this.ready = true;
    this.invalidate();
  }
  resize(width: number, height: number) {
    if (
      this.ready &&
      (this.app.renderer.width !== width || this.app.renderer.height !== height)
    )
      this.app.renderer.resize(width, height);
  }
  private create(layer: SceneLayer): Node {
    const root = new Container();
    const display =
      layer.clip.kind === 'text'
        ? new Text()
        : layer.clip.kind === 'shape'
          ? new Graphics()
          : new Sprite(Texture.EMPTY);
    const unfiltered = new Sprite(Texture.EMPTY);
    unfiltered.visible = false;
    const crop = new Graphics();
    const background = new Graphics();
    const words = new Container();
    const maskSprite = new Sprite(Texture.EMPTY);
    maskSprite.visible = false;
    root.addChild(unfiltered, background, display, words, crop, maskSprite);
    this.stage.addChild(root);
    const node = {
      root,
      display,
      unfiltered,
      crop,
      background,
      words,
      maskSprite,
      maskFeather: -1,
      signature: '',
      filters: [],
      approximate: false,
    };
    this.nodes.set(layer.clip.id, node);
    return node;
  }
  private configureFilters(node: Node, clip: Clip) {
    const signature = JSON.stringify(clip.effects);
    if (signature === node.signature) return;
    for (const filter of node.filters) filter.destroy();
    node.filters = [];
    node.signature = signature;
    node.approximate = false;
    for (const effect of clip.effects.filter(
      (effect) => effect.enabled !== false,
    )) {
      if (effect.type === 'blur' || effect.type === 'gaussian_blur')
        node.filters.push(
          new BlurFilter({
            strength: Math.max(
              0,
              number(effect.params.strength ?? effect.params.radius, 4),
            ),
            quality: 2,
          }),
        );
      else if (effect.type === 'grain' || effect.type === 'film_grain')
        node.filters.push(
          new NoiseFilter({ noise: number(effect.params.amount, 0.12) }),
        );
      else if (effect.type === 'vignette')
        node.filters.push(
          detailFilter(
            number(effect.params.amount ?? effect.params.strength, 0.35),
            0,
          ),
        );
      else if (effect.type === 'sharpen')
        node.filters.push(
          detailFilter(
            0,
            number(effect.params.amount ?? effect.params.strength, 0.25),
          ),
        );
      else if (
        [
          'colour_grade',
          'color_grade',
          'black_and_white',
          'black-and-white',
        ].includes(effect.type)
      ) {
        if (effect.type.includes('black')) {
          const filter = new ColorMatrixFilter();
          filter.blackAndWhite(false);
          node.filters.push(filter);
        } else {
          node.filters.push(gradeFilter(effect.params));
          if (effect.params.lut && effect.params.lut !== 'none')
            node.approximate = true;
        }
      } else if (
        ['zoom-punch', 'zoom_punch', 'zoom_punch_in'].includes(effect.type)
      ) {
        // Animated in the transform pass below.
      } else if (effect.type !== 'ducking') node.approximate = true;
    }
    node.root.filters = node.filters;
  }
  draw(
    project: KimoProject,
    assets: readonly Asset[],
    time: number,
    playing: boolean,
    rate: number,
    width: number,
    height: number,
    scrubbing = false,
  ) {
    if (!this.ready) return false;
    this.resize(width, height);
    this.backdrop
      .clear()
      .rect(0, 0, width, height)
      .fill(
        project.background === 'white'
          ? 0xffffff
          : project.background === 'cream'
            ? 0xf5f1e7
            : 0x000000,
      );
    this.approximate = false;
    let frameReady = true;
    const scene = buildScene(
      project,
      project.duration > 0
        ? Math.min(time, Math.max(0, project.duration - 1 / project.fps))
        : time,
    );
    const active = new Set(scene.map((layer) => layer.clip.id));
    for (const layer of scene)
      if (layer.clip.mask) active.add(`mask:${layer.clip.id}`);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const [id, node] of this.nodes)
      if (!active.has(id)) {
        node.root.destroy({ children: true });
        this.nodes.delete(id);
      }
    this.media.retain(active);
    const sx = width / project.width;
    const sy = height / project.height;
    this.stage.scale.set(sx, sy);
    for (const [index, layer] of scene.entries()) {
      const clip = layer.clip;
      const node = this.nodes.get(clip.id) ?? this.create(layer);
      this.stage.setChildIndex(node.root, index);
      this.configureFilters(node, clip);
      if (node.approximate) this.approximate = true;
      if (
        (clip.transitionIn &&
          !supportedTransitions.has(clip.transitionIn.type)) ||
        (clip.transitionOut &&
          !supportedTransitions.has(clip.transitionOut.type))
      )
        this.approximate = true;
      const kind = clip.transitionIn?.type ?? '';
      const outKind = clip.transitionOut?.type ?? '';
      let alpha = layer.opacity;
      if (
        ['dissolve', 'cross-dissolve', 'crossfade', 'dip-to-black'].includes(
          kind,
        )
      )
        alpha *= layer.transition;
      if (
        ['dissolve', 'cross-dissolve', 'crossfade', 'dip-to-black'].includes(
          outKind,
        )
      )
        alpha *= layer.transitionOut;
      let x = project.width / 2 + layer.x;
      let y = project.height / 2 + layer.y;
      let scale = layer.scale;
      if (kind === 'slide-left') x += project.width * (1 - layer.transition);
      if (kind === 'slide-right') x -= project.width * (1 - layer.transition);
      if (kind === 'slide-up') y += project.height * (1 - layer.transition);
      if (kind === 'slide-down') y -= project.height * (1 - layer.transition);
      if (kind === 'zoom-in') scale *= 0.8 + layer.transition * 0.2;
      if (outKind === 'slide-left')
        x -= project.width * (1 - layer.transitionOut);
      if (outKind === 'slide-right')
        x += project.width * (1 - layer.transitionOut);
      if (outKind === 'slide-up')
        y -= project.height * (1 - layer.transitionOut);
      if (outKind === 'slide-down')
        y += project.height * (1 - layer.transitionOut);
      if (outKind === 'zoom-in') scale *= 0.8 + layer.transitionOut * 0.2;
      for (const effect of clip.effects)
        if (
          ['zoom-punch', 'zoom_punch', 'zoom_punch_in'].includes(effect.type)
        ) {
          const duration = Math.max(
            1 / project.fps,
            number(effect.params.duration, 0.3),
          );
          const progress = Math.min(1, layer.localTime / duration);
          scale *= 1 + (number(effect.params.scale, 1.15) - 1) * (1 - progress);
        }
      node.root.position.set(x, y);
      node.root.scale.set(scale);
      node.root.rotation = (layer.rotation * Math.PI) / 180;
      node.root.alpha = alpha;
      if (node.display instanceof Sprite) {
        const asset = clip.assetId ? byId.get(clip.assetId) : undefined;
        if (asset && asset.kind === 'video') {
          const entry = this.media.video(
            clip.id,
            asset,
            layer.sourceTime,
            playing,
            clip.speed * rate,
            scrubbing,
          );
          if (entry.texture && !entry.element.seeking)
            node.display.texture = entry.texture;
          else if (entry.element.error) this.approximate = true;
          else frameReady = false;
        } else if (asset && asset.kind === 'image') {
          const entry = this.media.image(asset);
          if (entry.texture) {
            node.display.texture = entry.texture;
            if (
              asset.source === 'web' &&
              !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ) {
              node.imageShownAt ??= performance.now();
              const progress = Math.min(
                1,
                (performance.now() - node.imageShownAt) / 120,
              );
              node.root.alpha *= progress;
              if (progress < 1) setTimeout(this.invalidate, 16);
            }
          }
        } else if (!asset) this.approximate = true;
        node.display.anchor.set(0.5);
        node.display.width = project.width;
        node.display.height = project.height;
      } else if (node.display instanceof Text) {
        const spec = textStyle(clip.text?.style ?? 'caption-clean');
        node.display.text =
          'uppercase' in spec && spec.uppercase
            ? (clip.text?.content ?? '').toUpperCase()
            : (clip.text?.content ?? '');
        node.display.style = {
          fontFamily: spec.family,
          fontSize: clip.text?.size ?? spec.size,
          fontWeight: spec.weight,
          fontStyle: 'italic' in spec && spec.italic ? 'italic' : 'normal',
          fill: clip.text?.color ?? 0xffffff,
          align: clip.text?.align ?? 'center',
          wordWrap: true,
          wordWrapWidth: project.width * 0.9,
          stroke:
            'stroke' in spec && spec.stroke
              ? { color: 0x000000, width: 2, alpha: 0.25 }
              : undefined,
        };
        node.display.anchor.set(0.5);
        const placement = clip.text?.position ?? spec.position;
        node.display.position.set(
          0,
          placement === 'bottom'
            ? project.height * 0.38
            : placement === 'top'
              ? -project.height * 0.38
              : 0,
        );
        const progress = Math.min(1, layer.localTime / 0.3);
        if (clip.text?.animation === 'fade') node.root.alpha *= progress;
        if (clip.text?.animation === 'rise') {
          node.root.alpha *= progress;
          node.display.y += (1 - progress) * spec.size;
        }
        if (clip.text?.animation === 'type on')
          node.display.text = node.display.text.slice(
            0,
            Math.ceil(layer.localTime * 24),
          );
        node.background.clear();
        if ('box' in spec && spec.box)
          node.background
            .roundRect(
              -node.display.width / 2 - 24,
              node.display.y - node.display.height / 2 - 12,
              node.display.width + 48,
              node.display.height + 24,
              12,
            )
            .fill({ color: 0x000000, alpha: 0.7 });
        const highlighted =
          (clip.text?.style === 'caption-pop' ||
            clip.text?.animation === 'pop words') &&
          clip.text.words?.length;
        node.display.visible = !highlighted;
        if (highlighted && clip.text?.words) {
          while (node.words.children.length > clip.text.words.length)
            node.words.removeChildAt(node.words.children.length - 1).destroy();
          let total = 0;
          const wordNodes = clip.text.words.map((word, index) => {
            let item = node.words.children[index];
            if (!(item instanceof Text)) {
              item = new Text();
              node.words.addChild(item);
            }
            const text = item as Text;
            text.text = word.w.toUpperCase();
            text.style = {
              fontFamily: spec.family,
              fontSize: clip.text?.size ?? spec.size,
              fill:
                layer.localTime >= word.t && layer.localTime < word.t + word.d
                  ? 0xffd84d
                  : 0xffffff,
            };
            text.anchor.set(0, 0.5);
            total += text.width + spec.size * 0.2;
            return text;
          });
          let x = -total / 2;
          for (const word of wordNodes) {
            word.position.set(x, node.display.y);
            x += word.width + spec.size * 0.2;
          }
        } else {
          node.words.removeChildren().forEach((child) => child.destroy());
        }
      } else {
        node.display
          .clear()
          .roundRect(
            -project.width * 0.35,
            project.height * 0.3,
            project.width * 0.7,
            project.height * 0.12,
            12,
          )
          .fill({ color: 0x000000, alpha: 0.7 });
      }
      const crop = clip.transform.crop;
      node.crop.clear();
      const maskAsset = clip.mask ? byId.get(clip.mask.maskAssetId) : undefined;
      let maskTexture: Texture | undefined;
      if (clip.mask && maskAsset?.kind === 'image')
        maskTexture = this.media.image(maskAsset).texture;
      if (clip.mask && maskAsset?.kind === 'video')
        maskTexture = this.media.video(
          `mask:${clip.id}`,
          maskAsset,
          layer.sourceTime,
          playing,
          clip.speed * rate,
          scrubbing,
        ).texture;
      node.unfiltered.visible = Boolean(
        clip.mask?.scope && node.display instanceof Sprite,
      );
      if (node.unfiltered.visible && node.display instanceof Sprite) {
        node.unfiltered.texture = node.display.texture;
        node.unfiltered.anchor.set(0.5);
        node.unfiltered.width = project.width;
        node.unfiltered.height = project.height;
        node.root.filters = [];
        node.display.filters = node.filters;
      } else {
        node.display.filters = [];
        node.root.filters = node.filters;
      }
      if (clip.mask && maskTexture) {
        node.maskSprite.visible = true;
        node.maskSprite.texture = maskTexture;
        node.maskSprite.anchor.set(0.5);
        node.maskSprite.width = project.width;
        node.maskSprite.height = project.height;
        if (node.maskFeather !== clip.mask.feather) {
          node.maskSprite.filters?.forEach((filter) => filter.destroy());
          node.maskSprite.filters =
            clip.mask.feather > 0
              ? [new BlurFilter({ strength: clip.mask.feather, quality: 2 })]
              : [];
          node.maskFeather = clip.mask.feather;
        }
        node.display.setMask({
          mask: node.maskSprite,
          inverse:
            clip.mask.scope === 'background'
              ? !clip.mask.invert
              : clip.mask.invert,
          channel: 'red',
        });
        if (crop) this.approximate = true;
      } else if (crop) {
        node.maskSprite.visible = false;
        node.crop
          .rect(
            -project.width / 2 + crop.l * project.width,
            -project.height / 2 + crop.t * project.height,
            project.width * Math.max(0, 1 - crop.l - crop.r),
            project.height * Math.max(0, 1 - crop.t - crop.b),
          )
          .fill(0xffffff);
        node.display.mask = node.crop;
      } else {
        node.display.mask = null;
        node.maskSprite.visible = false;
        if (clip.mask) this.approximate = true;
      }
    }
    if (playing) {
      const videos = scene.filter(
        (layer) => layer.clip.kind === 'video',
      ).length;
      const upcoming = Object.values(project.clips)
        .filter(
          (clip) =>
            clip.kind === 'video' &&
            clip.start > time &&
            clip.start <= time + 1.5 &&
            !active.has(clip.id),
        )
        .slice(0, Math.max(0, 6 - videos));
      for (const clip of upcoming) {
        const asset = clip.assetId ? byId.get(clip.assetId) : undefined;
        if (asset?.kind === 'video')
          this.media.video(clip.id, asset, clip.in, false, clip.speed * rate);
      }
    }
    if (frameReady) this.app.renderer.render(this.app.stage);
    return frameReady;
  }
  async capture() {
    return this.app.renderer.extract.base64({
      target: this.app.stage,
      format: 'jpg',
      quality: 0.85,
    });
  }
  destroy() {
    this.generation++;
    this.media.destroy();
    if (this.ready) this.app.destroy({ removeView: false }, { children: true });
    this.ready = false;
    this.nodes.clear();
  }
}
