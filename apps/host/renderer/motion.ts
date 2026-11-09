/**
 * The motion layer: continuous, eased movement that runs underneath the
 * sprite's frame flip.
 *
 * A sheet row is only a handful of drawings — six for idle, over five and a
 * half seconds — and `steps()` cuts between them with nothing in between, so
 * on its own a pet is motionless most of the time and reads as mechanical.
 * Easing the whole figure at display framerate fixes that without a single
 * extra frame of art: the eye follows the smooth motion and stops reading the
 * drawing changes as jumps.
 *
 * Three layers compose, outermost first: `sway` rotates, `bob` travels, and
 * `squash` scales. They are separate elements because one `transform` can
 * only carry one animation, and because giving each its own period is what
 * keeps the result from looking like a metronome. Periods are deliberately
 * not multiples of the frame cycle, so the two slowly drift against each
 * other and the loop never announces itself.
 *
 * Everything is proportional — percentages and degrees, never pixels — so it
 * holds up at any `--pet-scale`.
 */
import type { SpriteStateName, SpriteStateSpec } from '@desktop-pets/shared';

/*
 * The renderer runs sandboxed over file:// with no module resolver, so a bare
 * import of the shared package would not load. These mirror SPRITE_BASELINE_Y
 * and SPRITE_SHEET.frameHeight, the same way renderer.ts redeclares its frame
 * size; motion.test.ts asserts they stay in step with the real constants.
 */
export const BASELINE_Y = 184;
export const FRAME_H = 208;

/** Rotate and scale about the feet, the one point that stays put. */
export const MOTION_ORIGIN = `50% ${((BASELINE_Y / FRAME_H) * 100).toFixed(2)}%`;

export interface LayerAnimations {
  sway: string;
  bob: string;
  squash: string;
}

interface Profile {
  /** `[keyframes name, period in ms, timing function, delay in ms]` per layer. */
  sway?: [string, number, string, number?];
  bob?: [string, number, string, number?];
  squash?: [string, number, string, number?];
}

const EASE_BODY = 'cubic-bezier(.42,0,.58,1)';
const EASE_STEP = 'cubic-bezier(.33,0,.4,1)';

/**
 * Keyframes, in transform units relative to the sprite box.
 *
 * Amplitudes are small on purpose. A desktop pet is about 96px tall and sits
 * over the user's work, so this has to read as breathing rather than waving
 * for attention.
 */
export const MOTION_KEYFRAMES: Readonly<Record<string, string>> = {
  'm-breathe': '0%,100%{transform:scale(1.006,.994)}50%{transform:scale(.995,1.008)}',
  'm-breathe-deep': '0%,100%{transform:scale(1.010,.990)}50%{transform:scale(.992,1.012)}',
  'm-sway': '0%,100%{transform:rotate(-0.9deg)}50%{transform:rotate(0.9deg)}',
  'm-sway-wide': '0%,100%{transform:rotate(-2.6deg)}50%{transform:rotate(2.6deg)}',
  'm-float': '0%,100%{transform:translateY(0)}50%{transform:translateY(-2.4%)}',
  'm-float-slow': '0%,100%{transform:translateY(0)}50%{transform:translateY(-1.8%)}',

  // Two footfalls per row, the second a touch lighter so the gait is not a loop
  // of one identical step.
  'm-trot':
    '0%,100%{transform:translateY(0)}24%{transform:translateY(-5.5%)}50%{transform:translateY(0)}74%{transform:translateY(-4.4%)}',
  'm-trot-squash':
    '0%,100%{transform:scale(1.03,.97)}24%{transform:scale(.975,1.025)}50%{transform:scale(1.03,.97)}74%{transform:scale(.98,1.02)}',
  'm-lean-r': '0%,100%{transform:rotate(3.4deg)}50%{transform:rotate(5.2deg)}',
  'm-lean-l': '0%,100%{transform:rotate(-3.4deg)}50%{transform:rotate(-5.2deg)}',

  // The jump. Uneven on purpose: a slow gather, a fast launch, a long hang
  // across the apex, then a landing that overshoots before it settles. Even
  // spacing is exactly what makes a jump read as robotic.
  'm-hop':
    '0%,14%{transform:translateY(0);animation-timing-function:cubic-bezier(.3,0,.7,.2)}' +
    '24%{transform:translateY(4%);animation-timing-function:cubic-bezier(.2,.8,.3,1)}' +
    '40%{transform:translateY(-26%);animation-timing-function:cubic-bezier(.35,0,.65,.4)}' +
    '50%{transform:translateY(-34%);animation-timing-function:linear}' +
    '60%{transform:translateY(-34%);animation-timing-function:cubic-bezier(.5,0,.9,.6)}' +
    '78%{transform:translateY(0);animation-timing-function:cubic-bezier(.2,.9,.4,1)}' +
    '87%{transform:translateY(3.5%);animation-timing-function:cubic-bezier(.3,.7,.4,1)}' +
    '95%,100%{transform:translateY(0)}',
  'm-hop-squash':
    '0%,14%{transform:scale(1,1)}24%{transform:scale(1.09,.91)}40%{transform:scale(.91,1.10)}' +
    '50%,60%{transform:scale(.98,1.02)}78%{transform:scale(1.12,.88)}87%{transform:scale(.97,1.03)}' +
    '95%,100%{transform:scale(1,1)}',

  // Failure: fold forward, drop, and stay down. Played once and held.
  'm-slump':
    '0%{transform:translateY(0)}18%{transform:translateY(-2%)}' +
    '55%{transform:translateY(3.5%)}100%{transform:translateY(4.2%)}',
  'm-slump-tilt':
    '0%{transform:rotate(0)}18%{transform:rotate(-1.5deg)}' +
    '60%{transform:rotate(4.5deg)}100%{transform:rotate(5.2deg)}',

  // Alarm: a fast lateral shiver, short enough to read as urgent.
  'm-shake': '0%,100%{transform:translateX(0)}25%{transform:translateX(-2.2%)}75%{transform:translateX(2.2%)}',
  'm-shake-tilt': '0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}',

  // Working: a busier, shorter nod than idle, leaning very slightly in.
  'm-nod': '0%,100%{transform:translateY(0)}45%{transform:translateY(-3.2%)}',
  // Review: a slow scan across, as though reading something.
  'm-scan': '0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}',
};

/**
 * Per state, which keyframes drive which layer and how fast.
 *
 * Periods are chosen against each state's own frame duration so the two never
 * line up: idle flips a drawing every 917ms while breathing on a 2350ms beat
 * and swaying on 4100ms, so the same combination of drawing and pose does not
 * come round again for a long time.
 */
const PROFILES: Readonly<Record<SpriteStateName, Profile>> = {
  idle: {
    sway: ['m-sway', 4100, EASE_BODY],
    bob: ['m-float', 2350, EASE_BODY],
    squash: ['m-breathe', 2350, EASE_BODY, -380],
  },
  waiting: {
    sway: ['m-sway-wide', 3300, EASE_BODY],
    bob: ['m-float-slow', 2050, EASE_BODY],
    squash: ['m-breathe', 2700, EASE_BODY, -240],
  },
  working: {
    sway: ['m-sway', 1900, EASE_BODY],
    bob: ['m-nod', 760, EASE_STEP],
    squash: ['m-breathe-deep', 1520, EASE_BODY, -190],
  },
  review: {
    sway: ['m-scan', 2900, EASE_BODY],
    bob: ['m-float-slow', 1700, EASE_BODY],
    squash: ['m-breathe', 2300, EASE_BODY, -300],
  },
  'running-right': {
    sway: ['m-lean-r', 530, EASE_BODY],
    bob: ['m-trot', 530, EASE_STEP],
    squash: ['m-trot-squash', 530, EASE_STEP],
  },
  'running-left': {
    sway: ['m-lean-l', 530, EASE_BODY],
    bob: ['m-trot', 530, EASE_STEP],
    squash: ['m-trot-squash', 530, EASE_STEP],
  },
  waving: {
    sway: ['m-sway-wide', 700, EASE_BODY],
    bob: ['m-float', 700, EASE_BODY],
    squash: ['m-breathe-deep', 700, EASE_BODY, -90],
  },
  jumping: {
    bob: ['m-hop', 840, 'linear'],
    squash: ['m-hop-squash', 840, EASE_BODY],
  },
  failed: {
    // Per iteration, as everywhere else; a held state is stretched across its
    // whole run below rather than being pre-multiplied here.
    sway: ['m-slump-tilt', 1220, EASE_BODY],
    bob: ['m-slump', 1220, EASE_BODY],
  },
  alarm: {
    sway: ['m-shake-tilt', 290, 'linear'],
    bob: ['m-shake', 190, 'linear'],
    squash: ['m-breathe-deep', 820, EASE_BODY],
  },
};

/** Every `@keyframes` rule the motion layer needs, ready to insert. */
export function motionKeyframeRules(): string[] {
  return Object.entries(MOTION_KEYFRAMES).map(([name, body]) => `@keyframes ${name} { ${body} }`);
}

const shorthand = (
  [name, period, easing, delay]: NonNullable<Profile[keyof Profile]>,
  iterations: number | 'infinite',
  fill: boolean,
): string =>
  `${name} ${period}ms ${easing} ${delay ? `${delay}ms ` : ''}${iterations}${fill ? ' forwards' : ''}`;

/**
 * The three `animation` shorthands for a state, or empty strings to stand
 * still.
 *
 * One-shot states borrow the sheet's own duration and loop count so the
 * movement lands with the last drawing rather than running on past it. A
 * state that holds its final frame plays its movement once across the whole
 * run and keeps the end pose, because a pet that has given up should not
 * slump twice.
 */
export function motionFor(spec: SpriteStateSpec, iterations: number | 'infinite'): LayerAnimations {
  const profile = PROFILES[spec.name];
  const none: LayerAnimations = { sway: '', bob: '', squash: '' };
  if (!profile) return none;

  const holds = spec.after === 'hold' && iterations !== 'infinite';
  const runs = iterations === 'infinite' ? 'infinite' : holds ? 1 : iterations;
  const stretch = holds && typeof iterations === 'number' ? iterations : 1;

  const build = (layer: NonNullable<Profile[keyof Profile]> | undefined): string => {
    if (!layer) return '';
    const [name, period, easing, delay] = layer;
    return shorthand([name, period * stretch, easing, delay], runs, holds);
  };

  return { sway: build(profile.sway), bob: build(profile.bob), squash: build(profile.squash) };
}
