import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, BlurFilter, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Content, Scene, SceneNode } from '../../lib/render/scene';
import type { PaneVisual } from '../../lib/layout/textures';

/**
 * Draws a scene with PixiJS (WebGL), the way the console composes its layout: textured quads
 * in draw order with alpha, masks and clipping. Interaction lives in the overlay on top; this
 * only draws, and only when something changed.
 */

interface Props {
  scene: Scene | null;
  /** Wallpaper image (data/blob URL) or a solid background colour. */
  background: { url: string } | { color: string };
  /** Device pixels per layout pixel: devicePixelRatio × zoom, for sharp text and edges. */
  resolution: number;
  /** Layers hidden in the editor only (eye toggle). */
  hiddenIds: ReadonlySet<string>;
}

/** CSS colour -> Pixi number + alpha. */
function css(c: string): { color: number; alpha: number } {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
    return { color: (Math.round(+r) << 16) | (Math.round(+g) << 8) | Math.round(+b), alpha: +a };
  }
  if (c.startsWith('#')) return { color: parseInt(c.slice(1, 7), 16), alpha: 1 };
  return { color: 0, alpha: 1 };
}

const canvasTextures = new WeakMap<HTMLCanvasElement, Texture>();
const textureOf = (canvas: HTMLCanvasElement) => {
  let t = canvasTextures.get(canvas);
  if (!t) {
    t = Texture.from(canvas);
    canvasTextures.set(canvas, t);
  }
  return t;
};

/** Mock content rendered to canvases, by signature + resolution. */
const mockTextures = new Map<string, Texture>();
function mockTexture(sig: string, w: number, h: number, res: number, drawFn: (c: CanvasRenderingContext2D) => void) {
  const key = `${sig}@${res}`;
  let t = mockTextures.get(key);
  if (!t) {
    const el = document.createElement('canvas');
    el.width = Math.max(1, Math.ceil(w * res));
    el.height = Math.max(1, Math.ceil(h * res));
    const c = el.getContext('2d')!;
    c.scale(res, res);
    drawFn(c);
    t = Texture.from(el);
    if (mockTextures.size > 3000) {
      for (const [k, v] of mockTextures) {
        v.destroy(true);
        mockTextures.delete(k);
        if (mockTextures.size < 2000) break;
      }
    }
    mockTextures.set(key, t);
  }
  return t;
}

const images = new Map<string, Texture | 'loading' | 'error'>();

function visualDisplay(v: PaneVisual, w: number, h: number): Container {
  const box = new Container();
  if (v.color) {
    const { color, alpha } = css(v.color);
    box.addChild(new Graphics().rect(0, 0, w, h).fill({ color, alpha }));
    return box;
  }
  if (!v.canvas) return box;
  const tex = textureOf(v.canvas);
  const bgW = v.bgW ?? w;
  const bgH = v.bgH ?? h;
  const bgX = v.bgX ?? 0;
  const bgY = v.bgY ?? 0;
  let sprite: Container;
  if (v.repeatX || v.repeatY) {
    const t = new TilingSprite({ texture: tex, width: w, height: h });
    t.tileScale.set(bgW / v.canvas.width, bgH / v.canvas.height);
    t.tilePosition.set(bgX, bgY);
    sprite = t;
  } else {
    const s = new Sprite(tex);
    s.position.set(bgX, bgY);
    s.width = bgW;
    s.height = bgH;
    sprite = s;
    // The texture covers more than the pane (a sub-rectangle of UVs): clip to the pane.
    if (bgX < -0.5 || bgY < -0.5 || bgX + bgW > w + 0.5 || bgY + bgH > h + 0.5) {
      const clip = new Graphics().rect(0, 0, w, h).fill(0xffffff);
      const wrap = new Container();
      wrap.addChild(s, clip);
      wrap.mask = clip;
      sprite = wrap;
    }
  }
  if (v.flipX || v.flipY) {
    const f = new Container();
    f.position.set(w / 2, h / 2);
    f.scale.set(v.flipX ? -1 : 1, v.flipY ? -1 : 1);
    sprite.position.set(sprite.position.x - w / 2, sprite.position.y - h / 2);
    f.addChild(sprite);
    box.addChild(f);
  } else box.addChild(sprite);
  return box;
}

function contentDisplay(content: Content, node: SceneNode, res: number, onImage: () => void): Container | null {
  const { rect } = node;
  if (content.type === 'canvas') {
    const s = new Sprite(mockTexture(content.sig, content.w, content.h, res, content.draw));
    s.position.set(rect.x + content.x, rect.y + content.y);
    s.width = content.w;
    s.height = content.h;
    return s;
  }
  if (content.type === 'image') {
    const box = new Container();
    box.position.set(rect.x + content.x, rect.y + content.y);
    const state = images.get(content.url);
    if (!state) {
      images.set(content.url, 'loading');
      Assets.load<Texture>(content.url)
        .then((t) => {
          images.set(content.url, t);
          onImage();
        })
        .catch(() => images.set(content.url, 'error'));
    }
    const tex = images.get(content.url);
    if (tex instanceof Texture) {
      const s = new Sprite(tex);
      const k = Math.max(content.w / tex.width, content.h / tex.height);
      s.width = tex.width * k;
      s.height = tex.height * k;
      s.position.set((content.w - s.width) / 2, (content.h - s.height) / 2);
      const m = new Graphics();
      if (content.radius) m.roundRect(0, 0, content.w, content.h, content.radius);
      else m.rect(0, 0, content.w, content.h);
      m.fill(0xffffff);
      box.addChild(s, m);
      s.mask = m;
    }
    return box;
  }
  // Console picture: texture through its material, with rounded corners, shadow and masks.
  const { w, h } = rect;
  const box = new Container();
  box.position.set(rect.x, rect.y);
  if (content.shadow) {
    const sh = new Graphics().roundRect(0, 1.5, w, h, content.radius ?? 2).fill({ color: 0, alpha: 0.22 });
    sh.filters = [new BlurFilter({ strength: 3 })];
    box.addChild(sh);
  }
  let inner: Container = visualDisplay(content.v, w, h);
  if (content.radius) {
    const m = new Graphics().roundRect(0, 0, w, h, content.radius).fill(0xffffff);
    const wrap = new Container();
    wrap.addChild(inner, m);
    wrap.mask = m;
    inner = wrap;
  }
  // Framebuffer-alpha masks: each layer's alpha intersects.
  for (const l of content.masks ?? []) {
    const shape = l.v?.canvas ? visualDisplay(l.v, l.w, l.h) : new Graphics().rect(0, 0, l.w, l.h).fill(0xffffff);
    shape.position.set(l.x, l.y);
    const wrap = new Container();
    wrap.addChild(inner, shape);
    wrap.mask = shape;
    inner = wrap;
  }
  box.addChild(inner);
  return box;
}

function buildDisplay(node: SceneNode, hiddenIds: ReadonlySet<string>, res: number, onImage: () => void): Container {
  const c = new Container();
  c.position.set(node.x, node.y);
  c.rotation = (node.rotation * Math.PI) / 180;
  c.scale.set(node.scaleX, node.scaleY);
  c.alpha = node.alpha;
  if (node.content) {
    const d = contentDisplay(node.content, node, res, onImage);
    if (d) c.addChild(d);
  }
  if (node.children.length) {
    const kids = new Container();
    kids.x = node.childOffsetX;
    for (const ch of node.children) if (!ch.hidden && !hiddenIds.has(ch.id)) kids.addChild(buildDisplay(ch, hiddenIds, res, onImage));
    if (node.clip) {
      const m = new Graphics().rect(-4000, node.clip.top, 8000, node.clip.bottom - node.clip.top).fill(0xffffff);
      kids.addChild(m);
      kids.mask = m;
    }
    c.addChild(kids);
  }
  return c;
}

export const PixiView: React.FC<Props> = ({ scene, background, resolution, hiddenIds }) => {
  const host = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [ready, setReady] = useState(false);
  const [imageTick, setImageTick] = useState(0);
  const width = scene?.width ?? 1280;
  const height = scene?.height ?? 720;

  useEffect(() => {
    let cancelled = false;
    const app = new Application();
    app
      .init({ width, height, backgroundAlpha: 0, antialias: true, autoStart: false, resolution, autoDensity: true, preference: 'webgl' })
      .then(() => {
        if (cancelled) {
          app.destroy(true);
          return;
        }
        appRef.current = app;
        host.current?.appendChild(app.canvas);
        setReady(true);
      });
    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
    // The renderer is created once; size and resolution changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!app || !ready) return;
    const res = Math.min(4, Math.max(1, resolution));
    if (app.renderer.resolution !== res || app.renderer.width !== width) {
      app.renderer.resolution = res;
      app.renderer.resize(width, height);
    }
    const old = app.stage.removeChildren();
    old.forEach((o) => o.destroy({ children: true }));

    // Background: the theme image, or the console's own colour.
    if ('url' in background) {
      const bg = images.get(background.url);
      if (bg instanceof Texture) {
        const s = new Sprite(bg);
        s.width = width;
        s.height = height;
        app.stage.addChild(s);
      } else if (!bg) {
        images.set(background.url, 'loading');
        Assets.load<Texture>({ src: background.url, parser: 'loadTextures' })
          .then((t) => {
            images.set(background.url, t);
            setImageTick((n) => n + 1);
          })
          .catch(() => images.set(background.url, 'error'));
      }
    } else {
      const { color, alpha } = css(background.color);
      app.stage.addChild(new Graphics().rect(0, 0, width, height).fill({ color, alpha }));
    }
    if (scene) app.stage.addChild(buildDisplay(scene.root, hiddenIds, res, () => setImageTick((n) => n + 1)));
    app.render();
  }, [ready, scene, background, resolution, hiddenIds, imageTick, width, height]);

  return <div ref={host} className="absolute inset-0 [&>canvas]:block [&>canvas]:w-full [&>canvas]:h-full" />;
};
