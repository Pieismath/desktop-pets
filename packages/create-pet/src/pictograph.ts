/**
 * Concepts the generator has no drawing code for.
 *
 * The parts engine draws creatures and people, and it draws them well, but it
 * will never draw a flower, a pizza or a lobster — those are not variations on
 * a body, they are separate knowledge. Writing a draw function per concept
 * does not terminate, so this takes the other route: a picture already exists
 * for a few thousand everyday things, in the emoji font every machine ships,
 * and the app already knows how to animate an arbitrary picture.
 *
 * So a concept costs **one line of data** here rather than a drawing function,
 * and the result is animated through the same motion vocabulary as everything
 * else. It is still a finite list — but a list of things, extended by typing
 * one line, instead of a list of shapes someone has to draw.
 *
 * This file is pure data and matching so it works in the browser too; the
 * rasterising half lives in `from-pictograph.ts`.
 */
import { CLDR_PACKED } from './concepts-cldr.js';

/**
 * Keyword → pictograph. Written singular and lowercase; the matcher handles
 * plurals. Where several words mean the same thing they each get a line,
 * because that is the whole point of the file being cheap to extend.
 */
export const CONCEPTS: Record<string, string> = {
  // food
  pizza: '🍕', burger: '🍔', hamburger: '🍔', cheeseburger: '🍔', fries: '🍟', 'hot dog': '🌭',
  sandwich: '🥪', taco: '🌮', burrito: '🌯', sushi: '🍣', ramen: '🍜', noodles: '🍜', pasta: '🍝',
  spaghetti: '🍝', curry: '🍛', rice: '🍚', bread: '🍞', baguette: '🥖', croissant: '🥐',
  pretzel: '🥨', bagel: '🥯', pancake: '🥞', waffle: '🧇', egg: '🍳', bacon: '🥓', steak: '🥩',
  chicken: '🍗', cheese: '🧀', salad: '🥗', soup: '🍲', popcorn: '🍿', doughnut: '🍩', donut: '🍩',
  cookie: '🍪', cake: '🍰', birthday: '🎂', cupcake: '🧁', pie: '🥧', chocolate: '🍫',
  candy: '🍬', lollipop: '🍭', 'ice cream': '🍦', icecream: '🍨', honey: '🍯',
  apple: '🍎', banana: '🍌', orange: '🍊', lemon: '🍋', grapes: '🍇', strawberry: '🍓',
  watermelon: '🍉', peach: '🍑', pear: '🍐', cherry: '🍒', pineapple: '🍍', mango: '🥭',
  coconut: '🥥', kiwi: '🥝', avocado: '🥑', tomato: '🍅', carrot: '🥕', corn: '🌽',
  potato: '🥔', broccoli: '🥦', mushroom: '🍄', pepper: '🌶️', cucumber: '🥒', onion: '🧅',
  garlic: '🧄', peanut: '🥜', chestnut: '🌰',
  coffee: '☕', tea: '🍵', beer: '🍺', wine: '🍷', cocktail: '🍸', whisky: '🥃', whiskey: '🥃',
  milk: '🥛', juice: '🧃', soda: '🥤', water: '💧', bottle: '🍾', teapot: '🫖',

  // sea life and small creatures the parts engine cannot shape
  lobster: '🦞', crab: '🦀', shrimp: '🦐', squid: '🦑', jellyfish: '🪼', shell: '🐚',
  snail: '🐌', butterfly: '🦋', bug: '🐛', caterpillar: '🐛', ant: '🐜', bee: '🐝',
  beetle: '🪲', ladybug: '🐞', ladybird: '🐞', cricket: '🦗', cockroach: '🪳', fly: '🪰',
  worm: '🪱', spider: '🕷️', scorpion: '🦂', mosquito: '🦟', starfish: '⭐', coral: '🪸',
  octopus: '🐙', 'pufferfish': '🐡', blowfish: '🐡', tropicalfish: '🐠',

  // plants and nature
  flower: '🌸', blossom: '🌸', rose: '🌹', tulip: '🌷', sunflower: '🌻', daisy: '🌼',
  hibiscus: '🌺', bouquet: '💐', cactus: '🌵', tree: '🌳', 'palm tree': '🌴',
  'pine tree': '🌲', evergreen: '🌲', leaf: '🍃', maple: '🍁', clover: '🍀', shamrock: '☘️',
  seedling: '🌱', sprout: '🌱', herb: '🌿', plant: '🪴', bamboo: '🎋', wheat: '🌾',
  mountain: '⛰️', volcano: '🌋', desert: '🏜️', island: '🏝️', beach: '🏖️', wave: '🌊',
  ocean: '🌊', fire: '🔥', flame: '🔥', snowflake: '❄️', snowman: '⛄', rainbow: '🌈',
  cloud: '☁️', sun: '☀️', sunshine: '☀️', moon: '🌙', star: '⭐', comet: '☄️',
  lightning: '⚡', tornado: '🌪️', umbrella: '☂️', rain: '🌧️', storm: '⛈️',
  earth: '🌍', planet: '🪐', saturn: '🪐', galaxy: '🌌',

  // objects
  book: '📕', books: '📚', notebook: '📓', newspaper: '📰', pencil: '✏️', pen: '🖊️',
  paintbrush: '🖌️', crayon: '🖍️', scissors: '✂️', paperclip: '📎', pin: '📌',
  key: '🔑', lock: '🔒', hammer: '🔨', wrench: '🔧', screwdriver: '🪛', saw: '🪚',
  toolbox: '🧰', magnet: '🧲', ladder: '🪜', bucket: '🪣', broom: '🧹', sponge: '🧽',
  soap: '🧼', candle: '🕯️', lamp: '💡', lightbulb: '💡', flashlight: '🔦', torch: '🔦',
  battery: '🔋', plug: '🔌', computer: '💻', laptop: '💻', desktop: '🖥️', keyboard: '⌨️',
  mouse: '🖱️', printer: '🖨️', phone: '📱', telephone: '☎️', camera: '📷', video: '📹',
  television: '📺', radio: '📻', microphone: '🎤', headphones: '🎧', speaker: '🔊',
  clock: '🕐', watch: '⌚', hourglass: '⏳', calendar: '📅', envelope: '✉️', mailbox: '📮',
  package: '📦', box: '📦', gift: '🎁', present: '🎁', balloon: '🎈', confetti: '🎉',
  trophy: '🏆', medal: '🏅', crown: '👑', ring: '💍', gem: '💎', diamond: '💎',
  money: '💰', coin: '🪙', cash: '💵', card: '💳', chart: '📈', clipboard: '📋',
  folder: '📁', file: '📄', trash: '🗑️', bin: '🗑️', mirror: '🪞', window: '🪟',
  door: '🚪', chair: '🪑', couch: '🛋️', bed: '🛏️', bath: '🛁', toilet: '🚽',
  shower: '🚿', teddy: '🧸', 'teddy bear': '🧸', kite: '🪁', yoyo: '🪀', puzzle: '🧩',
  dice: '🎲', chess: '♟️', darts: '🎯', target: '🎯', joystick: '🕹️', magnet2: '🧲',

  // clothes and accessories as objects
  shoe: '👟', sneaker: '👟', boot: '🥾', sandal: '🩴', sock: '🧦', glove: '🧤',
  scarf: '🧣', 'top hat': '🎩', cap: '🧢', sunglasses: '🕶️', backpack: '🎒',
  handbag: '👜', briefcase: '💼', purse: '👛', tshirt: '👕', jeans: '👖', kimono: '👘',

  // buildings and places
  house: '🏠', home: '🏠', cottage: '🏡', building: '🏢', office: '🏢', school: '🏫',
  hospital: '🏥', bank: '🏦', hotel: '🏨', church: '⛪', mosque: '🕌', temple: '🛕',
  castle: '🏰', tower: '🗼', bridge: '🌉', factory: '🏭', tent: '⛺', barn: '🏚️',
  lighthouse: '🗼', stadium: '🏟️', shop: '🏪', store: '🏪', 'city': '🏙️',

  // vehicles
  car: '🚗', taxi: '🚕', bus: '🚌', truck: '🚚', van: '🚐', tractor: '🚜',
  ambulance: '🚑', 'fire engine': '🚒', 'police car': '🚓', motorcycle: '🏍️',
  scooter: '🛵', bicycle: '🚲', bike: '🚲', skateboard: '🛹', rollerskate: '🛼',
  train: '🚂', tram: '🚊', subway: '🚇', plane: '✈️', aeroplane: '✈️', airplane: '✈️',
  helicopter: '🚁', rocket: '🚀', spaceship: '🛸', ufo: '🛸', boat: '⛵', sailboat: '⛵',
  ship: '🚢', canoe: '🛶', anchor: '⚓', parachute: '🪂', sled: '🛷',

  // sport, music, symbols
  basketball: '🏀', football: '🏈', soccer: '⚽', baseball: '⚾', tennis: '🎾',
  volleyball: '🏐', rugby: '🏉', golf: '⛳', bowling: '🎳', dart: '🎯', boxing: '🥊',
  skis: '🎿', snowboard: '🏂', surfboard: '🏄', fishing: '🎣', dumbbell: '🏋️',
  guitar: '🎸', piano: '🎹', trumpet: '🎺', violin: '🎻', drum: '🥁', saxophone: '🎷',
  banjo: '🪕', accordion: '🪗', music: '🎵', headphone: '🎧',
  heart: '❤️', sparkle: '✨', bomb: '💣', skull: '💀', ghost2: '👻', alien2: '👽',
  brain: '🧠', eye: '👁️', tooth: '🦷', bone: '🦴', footprint: '👣',
  sword: '⚔️', shield: '🛡️', bow: '🏹', wand: '🪄', crystal: '🔮', potion: '🧪',
  microscope: '🔬', telescope: '🔭', dna: '🧬', pill: '💊', syringe: '💉', bandage: '🩹',
};

/**
 * The long tail, unpacked once on first use.
 *
 * Thousands of words from Unicode CLDR that nobody would sit down and type:
 * crustacean, escalator, stethoscope. The curated table above still wins where
 * the two overlap, because CLDR records synonyms rather than which emoji a
 * bare word most likely means.
 */
let tail: Map<string, string> | undefined;
function longTail(): Map<string, string> {
  if (!tail) {
    tail = new Map();
    for (const line of CLDR_PACKED.split('\n')) {
      const tab = line.indexOf('\t');
      if (tab < 1) continue;
      const glyph = line.slice(0, tab);
      // comma-separated, because the words themselves contain spaces
      for (const word of line.slice(tab + 1).split(',')) if (word) tail.set(word, glyph);
    }
  }
  return tail;
}

function lookup(phrase: string): string | undefined {
  return (
    CONCEPTS[phrase] ??
    longTail().get(phrase) ??
    // plurals, without needing an entry for each
    (phrase.endsWith('es') ? CONCEPTS[phrase.slice(0, -2)] ?? longTail().get(phrase.slice(0, -2)) : undefined) ??
    (phrase.endsWith('s') ? CONCEPTS[phrase.slice(0, -1)] ?? longTail().get(phrase.slice(0, -1)) : undefined)
  );
}

export interface ConceptHit {
  /** The word that matched. */
  term: string;
  /** The pictograph to draw. */
  glyph: string;
}

const MAX_PHRASE = 3;

/**
 * Find a concept in a description.
 *
 * Looks up word groups rather than running one enormous alternation, which
 * matters because this runs on every keystroke in the browser and the
 * vocabulary is now in the thousands.
 *
 * The winner is the longest match, and among equal lengths the **rightmost**,
 * because English noun phrases put the head last: "a red car" is a car, not
 * something red. A longer phrase still wins outright, so "a hot dog" is a hot
 * dog rather than a dog.
 */
export function findConcept(prompt: string): ConceptHit | undefined {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let best: (ConceptHit & { size: number; at: number }) | undefined;
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(MAX_PHRASE, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      if (phrase.length < 3) continue;
      const glyph = lookup(phrase);
      if (!glyph) continue;
      if (!best || n > best.size || (n === best.size && i > best.at)) {
        best = { term: phrase, glyph, size: n, at: i };
      }
    }
  }
  return best ? { term: best.term, glyph: best.glyph } : undefined;
}

/** How many words the two layers know, for tools that want to say so. */
export function conceptCount(): { curated: number; total: number } {
  const curated = Object.keys(CONCEPTS).length;
  return { curated, total: curated + longTail().size };
}

/** Every curated concept word, for showing a handful of examples. */
export const KNOWN_CONCEPTS: readonly string[] = Object.keys(CONCEPTS).sort();
