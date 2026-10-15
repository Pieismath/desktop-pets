/**
 * The humanoid build: head, torso, two arms, two legs.
 *
 * This is the half of the generator that a species table can never cover. No
 * amount of ear and tail variants makes a person, because a person is a
 * different skeleton — so rather than widening the animal vocabulary further,
 * this adds the second skeleton and the parts that hang off it: hair, facial
 * hair, an outfit, a hat, glasses, something in one hand.
 *
 * Hats, glasses and held items are deliberately build-agnostic and exported,
 * because a cat in a wizard hat is a thing people ask for.
 */
import { LOGICAL_BASELINE, type Palette, type PixelCanvas, type Pose, type RGBA } from './pixel.js';
import { drawEyePair, drawMouth } from './char-face.js';
import type { HairKind, HatKind, HeldKind, OutfitKind, Traits } from './traits.js';

const CX = 24;
const FEET_Y = LOGICAL_BASELINE;

/** Head box, shared by every person so the face lands in the same place. */
const HEAD_X = 17;
const HEAD_W = 14;
const HEAD_H = 14;

function shade(c: RGBA, f: number): RGBA {
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - f))));
  return [m(c[0]), m(c[1]), m(c[2]), 255];
}

function tint(c: RGBA, f: number): RGBA {
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * f)));
  return [m(c[0]), m(c[1]), m(c[2]), 255];
}

/**
 * A visible variant of a colour, darker or lighter depending on which
 * direction has room. Without this a chef's white apron on a white coat, or a
 * black suit's lapels, disappear into the garment.
 */
function contrast(c: RGBA, f: number): RGBA {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return lum > 140 ? shade(c, f) : tint(c, f + 0.12);
}

// -------------------------------------------------------------------- hair

/** Hair drawn over an already-placed head. `back` fills behind the shoulders. */
function drawHair(c: PixelCanvas, X: (v: number) => number, headY: number, kind: HairKind, pal: Palette): void {
  const h = pal.hair;
  const skin = pal.main;
  const cap = (): void => {
    c.rect(X(HEAD_X), headY, HEAD_W, 4, h);
    c.rect(X(HEAD_X), headY + 1, 2, 4, h);
    c.rect(X(HEAD_X + HEAD_W - 2), headY + 1, 2, 4, h);
    c.px(X(HEAD_X), headY, null);
    c.px(X(HEAD_X + HEAD_W - 1), headY, null);
  };
  switch (kind) {
    case 'none':
      break;
    case 'short':
      cap();
      break;
    case 'long':
      cap();
      c.rect(X(HEAD_X - 1), headY + 2, 3, 15, h);
      c.rect(X(HEAD_X + HEAD_W - 2), headY + 2, 3, 15, h);
      break;
    case 'bob':
      cap();
      c.rect(X(HEAD_X - 1), headY + 2, 3, 9, h);
      c.rect(X(HEAD_X + HEAD_W - 2), headY + 2, 3, 9, h);
      break;
    case 'bun':
      cap();
      c.round(X(CX - 3), headY - 5, 6, 5, h);
      break;
    case 'ponytail':
      cap();
      // gathered behind one shoulder, so it reads from the front too
      c.rect(X(HEAD_X + HEAD_W - 1), headY + 3, 3, 12, h);
      c.rect(X(HEAD_X + HEAD_W), headY + 13, 3, 3, h);
      break;
    case 'spiky':
      cap();
      for (const x of [HEAD_X + 1, HEAD_X + 4, HEAD_X + 7, HEAD_X + 10]) {
        c.rect(X(x), headY - 2, 2, 3, h);
      }
      break;
    case 'afro':
      // a dome around the face rather than a slab on top of it: fill wide,
      // then put the face back so the hair reads as surrounding it
      c.ellipse(X(HEAD_X + HEAD_W / 2 - 0.5), headY + 3, 10, 8, h);
      c.round(X(HEAD_X + 1), headY + 2, HEAD_W - 2, HEAD_H - 2, skin);
      break;
  }
}

function drawFacialHair(
  c: PixelCanvas,
  X: (v: number) => number,
  headY: number,
  kind: Traits['facialHair'],
  pal: Palette,
): void {
  if (kind === 'none') return;
  const h = pal.hair;
  if (kind === 'moustache') {
    c.rect(X(CX - 3), headY + 9, 6, 2, h);
    return;
  }
  // beard: jaw, chin and a moustache above it
  c.rect(X(CX - 3), headY + 9, 6, 2, h);
  c.rect(X(HEAD_X + 1), headY + 10, HEAD_W - 2, 3, h);
  c.rect(X(CX - 3), headY + 13, 6, 3, h);
}

// ------------------------------------------------------------------ outfit

/** Torso decoration. The base torso is already filled in `cloth`. */
function drawOutfitFront(
  c: PixelCanvas,
  X: (v: number) => number,
  Y: (v: number) => number,
  kind: OutfitKind,
  pal: Palette,
  torsoY: number,
  torsoH: number,
): void {
  const dark = contrast(pal.cloth, 0.34);
  const lightCloth = contrast(pal.cloth, 0.16);
  switch (kind) {
    case 'suit':
      // lapels and a shirt front
      c.rect(X(CX - 2), Y(torsoY), 4, torsoH, pal.eyeWhite);
      c.rect(X(CX - 3), Y(torsoY), 2, 6, dark);
      c.rect(X(CX + 1), Y(torsoY), 2, 6, dark);
      c.rect(X(CX - 1), Y(torsoY + 2), 2, 5, pal.accent);
      break;
    case 'labcoat':
      c.rect(X(CX - 1), Y(torsoY), 2, torsoH, dark);
      c.rect(X(HEAD_X + 1), Y(torsoY + torsoH - 4), 3, 3, dark);
      break;
    case 'hoodie':
      // a hood bunched at the neck, plus a pocket
      c.rect(X(HEAD_X), Y(torsoY - 1), HEAD_W, 3, lightCloth);
      c.rect(X(CX - 4), Y(torsoY + torsoH - 5), 8, 3, dark);
      break;
    case 'apron':
      c.rect(X(CX - 4), Y(torsoY + 1), 8, torsoH - 1, lightCloth);
      c.rect(X(CX - 4), Y(torsoY + 1), 8, 1, dark);
      break;
    case 'armour':
      c.rect(X(HEAD_X), Y(torsoY + 3), HEAD_W, 1, dark);
      c.rect(X(HEAD_X), Y(torsoY + 7), HEAD_W, 1, dark);
      c.rect(X(CX - 2), Y(torsoY + 1), 4, 3, lightCloth);
      break;
    case 'robe':
      c.rect(X(CX - 1), Y(torsoY), 2, torsoH, dark);
      break;
    case 'dress':
      c.rect(X(CX - 2), Y(torsoY + 1), 4, 3, lightCloth);
      break;
    case 'plain':
      c.rect(X(CX - 4), Y(torsoY + 1), 8, 2, lightCloth);
      break;
  }
}

// ------------------------------------------------------- hats, specs, props

/** Hats sit above a head box whose top edge is `headY`. Works on any build. */
export function drawHat(c: PixelCanvas, X: (v: number) => number, headY: number, kind: HatKind, pal: Palette): void {
  const cloth = pal.cloth;
  const dark = contrast(cloth, 0.35);
  switch (kind) {
    case 'none':
      break;
    case 'cap':
      c.rect(X(HEAD_X), headY - 3, HEAD_W, 4, cloth);
      c.rect(X(HEAD_X - 3), headY, HEAD_W + 5, 2, dark);
      break;
    case 'beanie':
      c.rect(X(HEAD_X), headY - 4, HEAD_W, 5, cloth);
      c.rect(X(HEAD_X), headY, HEAD_W, 2, dark);
      break;
    case 'tophat':
      c.rect(X(HEAD_X + 2), headY - 9, HEAD_W - 4, 9, dark);
      c.rect(X(HEAD_X - 2), headY - 1, HEAD_W + 4, 2, dark);
      c.rect(X(HEAD_X + 2), headY - 3, HEAD_W - 4, 2, cloth);
      break;
    case 'wizard':
      for (let r = 0; r < 9; r++) {
        c.rect(X(CX - 1 - r), headY - 10 + r, 2 + r * 2, 1, cloth);
      }
      c.rect(X(HEAD_X - 2), headY - 1, HEAD_W + 4, 2, dark);
      break;
    case 'chef':
      c.round(X(HEAD_X), headY - 8, HEAD_W, 7, pal.eyeWhite);
      c.rect(X(HEAD_X + 1), headY - 2, HEAD_W - 2, 3, pal.eyeWhite);
      break;
    case 'crown':
      for (const x of [0, 4, 8, 12]) c.rect(X(HEAD_X + x), headY - 5, 2, 3, [240, 196, 76, 255]);
      c.rect(X(HEAD_X), headY - 2, HEAD_W, 3, [240, 196, 76, 255]);
      c.px(X(CX), headY - 1, [226, 92, 108, 255]);
      break;
    case 'helmet':
      // a dome with cheek guards and a nose bar, not a box over the whole head
      c.round(X(HEAD_X - 1), headY - 4, HEAD_W + 2, 8, cloth);
      c.rect(X(HEAD_X - 1), headY + 3, 2, 4, cloth);
      c.rect(X(HEAD_X + HEAD_W - 1), headY + 3, 2, 4, cloth);
      c.rect(X(HEAD_X - 1), headY + 2, HEAD_W + 2, 1, dark);
      c.rect(X(CX - 1), headY + 2, 2, 5, dark);
      break;
  }
}

export function drawGlasses(c: PixelCanvas, X: (v: number) => number, ey: number, pal: Palette): void {
  // rims have to read against the face they sit on, dark or light
  const rim = contrast(pal.main, 0.55);
  c.rect(X(HEAD_X + 1), ey - 1, 5, 1, rim);
  c.rect(X(HEAD_X + 8), ey - 1, 5, 1, rim);
  c.rect(X(HEAD_X + 1), ey + 4, 5, 1, rim);
  c.rect(X(HEAD_X + 8), ey + 4, 5, 1, rim);
  c.rect(X(HEAD_X + 1), ey, 1, 4, rim);
  c.rect(X(HEAD_X + 5), ey, 1, 4, rim);
  c.rect(X(HEAD_X + 8), ey, 1, 4, rim);
  c.rect(X(HEAD_X + 12), ey, 1, 4, rim);
  c.rect(X(HEAD_X + 6), ey + 1, 2, 1, rim);
}

/** Something in one hand, at a hand position the caller supplies. */
export function drawHeld(c: PixelCanvas, x: number, y: number, kind: HeldKind, pal: Palette): void {
  switch (kind) {
    case 'none':
      break;
    case 'sword':
      c.rect(x + 1, y - 14, 2, 13, [214, 222, 232, 255]);
      c.rect(x - 1, y - 2, 6, 2, [150, 110, 70, 255]);
      c.rect(x + 1, y, 2, 3, [110, 80, 52, 255]);
      break;
    case 'staff':
      c.rect(x + 1, y - 16, 2, 18, [146, 106, 68, 255]);
      c.round(x - 1, y - 20, 6, 5, pal.accent);
      break;
    case 'mug':
      c.rect(x - 1, y - 4, 6, 5, pal.eyeWhite);
      c.rect(x, y - 3, 4, 2, [122, 82, 54, 255]);
      c.rect(x + 5, y - 3, 1, 2, pal.eyeWhite);
      break;
    case 'book':
      c.rect(x - 2, y - 5, 8, 6, [190, 90, 84, 255]);
      c.rect(x - 1, y - 4, 6, 4, [244, 238, 226, 255]);
      c.rect(x + 1, y - 4, 1, 4, [190, 90, 84, 255]);
      break;
    case 'wrench':
      c.rect(x + 1, y - 9, 2, 10, [176, 184, 194, 255]);
      c.rect(x, y - 11, 4, 3, [176, 184, 194, 255]);
      c.px(x + 1, y - 10, null);
      c.px(x + 2, y - 10, null);
      break;
    case 'ball':
      c.ellipse(x + 2, y - 2, 4, 4, [230, 138, 58, 255]);
      c.rect(x - 2, y - 2, 9, 1, [150, 74, 26, 255]);
      c.rect(x + 2, y - 6, 1, 9, [150, 74, 26, 255]);
      break;
    case 'guitar':
      c.ellipse(x + 2, y - 2, 5, 5, [186, 108, 58, 255]);
      c.rect(x + 1, y - 16, 3, 12, [122, 78, 46, 255]);
      c.rect(x, y - 18, 5, 3, [92, 60, 36, 255]);
      c.rect(x + 2, y - 3, 1, 3, [92, 60, 36, 255]);
      break;
    case 'laptop':
      c.rect(x - 3, y - 7, 11, 7, [150, 158, 170, 255]);
      c.rect(x - 2, y - 6, 9, 5, [96, 176, 210, 255]);
      c.rect(x - 4, y, 13, 2, [120, 128, 140, 255]);
      break;
  }
}

// ------------------------------------------------------------------- build

/** Front-facing person. */
export function drawPersonFront(c: PixelCanvas, traits: Traits, pose: Pose, p: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const legs = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  const headY = Y(9);
  const torsoY = 25;
  const torsoH = 11;
  const torsoX = HEAD_X;
  const legTop = torsoY + torsoH;

  // legs, feet planted; the walk cycle shifts them sideways rather than lifting
  const step: Record<number, [number, number]> = { 0: [0, 0], 1: [-1, 1], 2: [-2, 2], 3: [1, -1], 4: [2, -2] };
  const [lo, ro] = step[legs] ?? [0, 0];
  const legColour = traits.outfit === 'dress' || traits.outfit === 'robe' ? p.cloth : contrast(p.cloth, 0.2);
  c.rect(X(CX - 6 + lo), Y(legTop), 5, FEET_Y - legTop - 2, legColour);
  c.rect(X(CX + 1 + ro), Y(legTop), 5, FEET_Y - legTop - 2, legColour);
  c.rect(X(CX - 6 + lo), Y(FEET_Y - 2), 5, 2, contrast(p.cloth, 0.45));
  c.rect(X(CX + 1 + ro), Y(FEET_Y - 2), 5, 2, contrast(p.cloth, 0.45));

  // a robe or dress falls over the legs as a skirt
  if (traits.outfit === 'robe' || traits.outfit === 'dress') {
    for (let i = 0; i < 8; i++) c.rect(X(torsoX - 1 - Math.floor(i / 3)), Y(legTop + i), HEAD_W + 2 + Math.floor(i / 3) * 2, 1, p.cloth);
  }

  // torso
  c.rect(X(torsoX), Y(torsoY), HEAD_W, torsoH, p.cloth);

  // arms: sleeves in cloth, hands in skin
  const al = Math.round(pose.armL ?? 0);
  const ar = Math.round(pose.armR ?? 0);
  c.rect(X(torsoX - 3), Y(torsoY + 1 + al), 3, 8, p.cloth);
  c.rect(X(torsoX + HEAD_W), Y(torsoY + 1 + ar), 3, 8, p.cloth);
  c.rect(X(torsoX - 3), Y(torsoY + 9 + al), 3, 2, p.main);
  c.rect(X(torsoX + HEAD_W), Y(torsoY + 9 + ar), 3, 2, p.main);

  // neck and head
  c.rect(X(CX - 2), Y(torsoY - 3), 4, 4, shade(p.main, 0.18));
  c.round(X(HEAD_X), headY, HEAD_W, HEAD_H, p.main);

  drawHair(c, X, headY, traits.hair, p);
  drawHat(c, X, headY, traits.hat, p);
  drawHeld(c, X(torsoX + HEAD_W + 1), Y(torsoY + 10 + ar), traits.held, p);
  drawOutfitFront(c, X, Y, traits.outfit, p, torsoY, torsoH);

  c.outline(p.out);

  const ey = headY + 6;
  drawEyePair(c, X(HEAD_X + 2), X(HEAD_X + 8), ey, traits.eyes, p, pose.eyes ?? 'open');
  drawFacialHair(c, X, headY, traits.facialHair, p);
  if (traits.glasses) drawGlasses(c, X, ey, p);
  if (traits.facialHair === 'none') drawMouth(c, X(CX - 2), headY + 11, p, pose.mouth ?? 'smile');
}

/** Side profile, facing right. */
export function drawPersonSide(c: PixelCanvas, traits: Traits, pose: Pose, p: Palette): void {
  const dy = Math.round(pose.dy ?? 0);
  const dx = Math.round(pose.dx ?? 0);
  const stepPhase = pose.legs ?? 0;
  const X = (v: number) => v + dx;
  const Y = (v: number) => v + dy;

  const headY = Y(9);
  const torsoY = 25;
  const torsoH = 11;
  const torsoX = 19;
  const torsoW = 11;
  const legTop = torsoY + torsoH;
  const legH = FEET_Y - legTop;

  const swing: Record<number, [number, number]> = { 0: [0, 0], 1: [2, -2], 2: [4, -4], 3: [-2, 2], 4: [-4, 4] };
  const [fx, bx] = swing[stepPhase] ?? [0, 0];
  const legColour = contrast(p.cloth, 0.2);

  // back leg first so the front one reads in front of it
  c.rect(X(torsoX + 3 + bx), Y(legTop), 5, legH - 2, shade(legColour, 0.25));
  c.rect(X(torsoX + 2 + bx), Y(FEET_Y - 2), 7, 2, shade(contrast(p.cloth, 0.45), 0.2));
  c.rect(X(torsoX + 3 + fx), Y(legTop), 5, legH - 2, legColour);
  c.rect(X(torsoX + 2 + fx), Y(FEET_Y - 2), 7, 2, contrast(p.cloth, 0.45));

  if (traits.outfit === 'robe' || traits.outfit === 'dress') {
    for (let i = 0; i < 8; i++) c.rect(X(torsoX - 1), Y(legTop + i), torsoW + 2 + Math.floor(i / 3) * 2, 1, p.cloth);
  }

  c.rect(X(torsoX), Y(torsoY), torsoW, torsoH, p.cloth);

  // the visible arm swings opposite the front leg
  const armSwing = Math.round(-fx / 2);
  c.rect(X(torsoX + 3 + armSwing), Y(torsoY + 1), 3, 8, contrast(p.cloth, 0.14));
  c.rect(X(torsoX + 3 + armSwing), Y(torsoY + 9), 3, 2, p.main);

  c.rect(X(torsoX + 3), Y(torsoY - 3), 4, 4, shade(p.main, 0.18));
  c.round(X(torsoX + 1), headY, HEAD_W - 1, HEAD_H, p.main);

  // hair and hats are drawn in head-box space, so shift into it
  const hx = (v: number) => X(v + (torsoX + 1) - HEAD_X);
  drawHair(c, hx, headY, traits.hair, p);
  drawHat(c, hx, headY, traits.hat, p);
  drawHeld(c, X(torsoX + 3 + armSwing), Y(torsoY + 10), traits.held, p);

  c.outline(p.out);

  // one eye, set forward in the profile
  const ey = headY + 6;
  drawEyePair(c, X(torsoX + 8), X(torsoX + 8), ey, traits.eyes, p, pose.eyes ?? 'open');
  drawFacialHair(c, hx, headY, traits.facialHair, p);
  if (traits.glasses) {
    c.rect(X(torsoX + 7), ey - 1, 6, 1, p.out);
    c.rect(X(torsoX + 7), ey + 4, 6, 1, p.out);
  }
}
