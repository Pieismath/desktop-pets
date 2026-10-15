/**
 * Turn a plain-English description into character traits.
 *
 * Deliberately offline and dependency-free: no API key, no network, no cost
 * to anyone. A prompt is matched against a vocabulary of species, colours and
 * features; anything it doesn't pin down is filled in deterministically from
 * a hash of the prompt, so the same words always give the same pet.
 *
 * Because that fallback is a guess rather than an understanding, the parse
 * reports which parts it had to invent, so callers can say so out loud instead
 * of handing back a random animal as though it were the one you asked for.
 */
import type { Palette, RGBA } from './pixel.js';
import { findConcept } from './pictograph.js';

/**
 * Every part the generator can draw, as data.
 *
 * These lists are the single source of truth: the TypeScript types below are
 * derived from them, and anything that needs to describe the vocabulary to
 * something else — a JSON schema for a model, a help message — reads the same
 * arrays, so a new part can never be offered without also being drawable.
 */
export const EAR_KINDS = ['pointed', 'floppy', 'round', 'tall', 'antenna', 'horns', 'none'] as const;
export const TAIL_KINDS = ['long', 'curled', 'bushy', 'puff', 'stub', 'none'] as const;
export const MUZZLE_KINDS = ['small', 'snout', 'beak', 'none'] as const;
export const BODY_KINDS = ['round', 'tall', 'boxy'] as const;
export const EYE_KINDS = ['round', 'slit', 'screen', 'beady'] as const;
export const GAITS = ['quadruped', 'biped'] as const;
export const PATTERN_KINDS = ['none', 'stripes', 'spots', 'patch'] as const;
/**
 * Which body plan to draw. A pet is not only an animal: people, and anything
 * shaped like one, need a different skeleton entirely — head, torso, two arms,
 * two legs — rather than a fourth ear variant bolted onto a quadruped.
 */
export const BUILDS = ['beast', 'humanoid'] as const;
export const HAIR_KINDS = ['none', 'short', 'long', 'bob', 'bun', 'spiky', 'ponytail', 'afro'] as const;
export const FACIAL_HAIR_KINDS = ['none', 'beard', 'moustache'] as const;
export const OUTFIT_KINDS = ['plain', 'suit', 'dress', 'robe', 'hoodie', 'apron', 'armour', 'labcoat'] as const;
export const HAT_KINDS = ['none', 'cap', 'wizard', 'crown', 'beanie', 'helmet', 'chef', 'tophat'] as const;
export const HELD_KINDS = ['none', 'sword', 'staff', 'mug', 'book', 'wrench', 'ball', 'guitar', 'laptop'] as const;

export type EarKind = (typeof EAR_KINDS)[number];
export type TailKind = (typeof TAIL_KINDS)[number];
export type MuzzleKind = (typeof MUZZLE_KINDS)[number];
export type BodyKind = (typeof BODY_KINDS)[number];
export type EyeKind = (typeof EYE_KINDS)[number];
export type Gait = (typeof GAITS)[number];
export type PatternKind = (typeof PATTERN_KINDS)[number];
export type Build = (typeof BUILDS)[number];
export type HairKind = (typeof HAIR_KINDS)[number];
export type FacialHairKind = (typeof FACIAL_HAIR_KINDS)[number];
export type OutfitKind = (typeof OUTFIT_KINDS)[number];
export type HatKind = (typeof HAT_KINDS)[number];
export type HeldKind = (typeof HELD_KINDS)[number];

export interface Traits {
  build: Build;
  ears: EarKind;
  tail: TailKind;
  muzzle: MuzzleKind;
  body: BodyKind;
  eyes: EyeKind;
  gait: Gait;
  whiskers: boolean;
  /** Markings painted over the coat. */
  pattern: PatternKind;
  hair: HairKind;
  facialHair: FacialHairKind;
  outfit: OutfitKind;
  /** Worn things work on any build — a cat can have a wizard hat. */
  hat: HatKind;
  glasses: boolean;
  held: HeldKind;
  /** Base coat or skin colour; the rest of the palette is derived from it. */
  colour: RGBA;
  /** Iris / detail colour. */
  accent: RGBA;
  hairColour: RGBA;
  clothing: RGBA;
  /** What the prompt was recognised as, for the CLI to report back. */
  species: string;
  colourName: string;
}

/** Stable 32-bit hash so the same prompt always yields the same pet. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A preset is a partial character: only the parts that make this thing what it
 * is. Everything else falls back to the defaults for its build, which is what
 * lets a wizard be three fields (robe, pointed hat, staff) rather than a
 * complete body.
 */
type SpeciesPreset = Partial<Omit<Traits, 'colour' | 'accent' | 'hairColour' | 'clothing' | 'species' | 'colourName'>> & {
  /** Colours this thing wears when the prompt doesn't name them. */
  coat?: string;
  hairCoat?: string;
  clothCoat?: string;
};

const BEAST_DEFAULTS = {
  build: 'beast',
  ears: 'round',
  tail: 'stub',
  muzzle: 'small',
  body: 'round',
  eyes: 'round',
  gait: 'quadruped',
  whiskers: false,
  pattern: 'none',
  hair: 'none',
  facialHair: 'none',
  outfit: 'plain',
  hat: 'none',
  glasses: false,
  held: 'none',
} as const satisfies Omit<Traits, 'colour' | 'accent' | 'hairColour' | 'clothing' | 'species' | 'colourName'>;

/** A person has no muzzle, ears or tail to speak of, and always has hair. */
const HUMAN_DEFAULTS = {
  ...BEAST_DEFAULTS,
  build: 'humanoid',
  ears: 'none',
  tail: 'none',
  muzzle: 'none',
  body: 'tall',
  gait: 'biped',
  hair: 'short',
} as const;

/**
 * Every shape the generator can build. Each entry is a recombination of the
 * same parts, so adding one costs a line of data and no drawing code.
 */
const SPECIES: Record<string, SpeciesPreset> = {
  cat: { ears: 'pointed', tail: 'long', muzzle: 'small', body: 'round', eyes: 'slit', gait: 'quadruped', whiskers: true, coat: 'ginger' },
  dog: { ears: 'floppy', tail: 'curled', muzzle: 'snout', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: false, coat: 'tan' },
  fox: { ears: 'pointed', tail: 'bushy', muzzle: 'snout', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: true, coat: 'ginger' },
  wolf: { ears: 'pointed', tail: 'bushy', muzzle: 'snout', body: 'tall', eyes: 'round', gait: 'quadruped', whiskers: false, coat: 'grey' },
  bear: { ears: 'round', tail: 'stub', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'brown' },
  panda: { ears: 'round', tail: 'stub', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'white', pattern: 'patch' },
  rabbit: { ears: 'tall', tail: 'puff', muzzle: 'small', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: true, coat: 'cream' },
  mouse: { ears: 'round', tail: 'long', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true, coat: 'grey' },
  hamster: { ears: 'round', tail: 'stub', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true, coat: 'tan' },
  squirrel: { ears: 'pointed', tail: 'bushy', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true, coat: 'brown' },
  hedgehog: { ears: 'round', tail: 'stub', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true, coat: 'brown' },
  raccoon: { ears: 'pointed', tail: 'bushy', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: true, coat: 'grey', pattern: 'patch' },
  bat: { ears: 'tall', tail: 'stub', muzzle: 'small', body: 'round', eyes: 'beady', gait: 'biped', whiskers: false, coat: 'charcoal' },
  kangaroo: { ears: 'tall', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'round', gait: 'biped', whiskers: false, coat: 'tan' },
  bee: { ears: 'antenna', tail: 'stub', muzzle: 'none', body: 'round', eyes: 'beady', gait: 'biped', whiskers: false, coat: 'gold', pattern: 'stripes' },
  pig: { ears: 'floppy', tail: 'curled', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'pink' },
  cow: { ears: 'floppy', tail: 'long', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'white', pattern: 'patch' },
  sheep: { ears: 'floppy', tail: 'puff', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'cream' },
  goat: { ears: 'floppy', tail: 'stub', muzzle: 'snout', body: 'round', eyes: 'slit', gait: 'quadruped', whiskers: false, coat: 'cream' },
  horse: { ears: 'pointed', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'round', gait: 'quadruped', whiskers: false, coat: 'brown' },
  deer: { ears: 'horns', tail: 'puff', muzzle: 'snout', body: 'tall', eyes: 'round', gait: 'quadruped', whiskers: false, coat: 'tan' },
  unicorn: { ears: 'horns', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'round', gait: 'quadruped', whiskers: false, coat: 'white' },
  elephant: { ears: 'floppy', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'grey' },
  monkey: { ears: 'round', tail: 'long', muzzle: 'small', body: 'round', eyes: 'round', gait: 'biped', whiskers: false, coat: 'brown' },
  bird: { ears: 'none', tail: 'puff', muzzle: 'beak', body: 'round', eyes: 'beady', gait: 'biped', whiskers: false, coat: 'blue' },
  penguin: { ears: 'none', tail: 'stub', muzzle: 'beak', body: 'tall', eyes: 'beady', gait: 'biped', whiskers: false, coat: 'charcoal' },
  owl: { ears: 'pointed', tail: 'stub', muzzle: 'beak', body: 'round', eyes: 'round', gait: 'biped', whiskers: false, coat: 'brown' },
  duck: { ears: 'none', tail: 'puff', muzzle: 'beak', body: 'round', eyes: 'beady', gait: 'biped', whiskers: false, coat: 'yellow' },
  frog: { ears: 'none', tail: 'none', muzzle: 'none', body: 'round', eyes: 'round', gait: 'biped', whiskers: false, coat: 'green' },
  turtle: { ears: 'none', tail: 'stub', muzzle: 'snout', body: 'round', eyes: 'beady', gait: 'quadruped', whiskers: false, coat: 'green' },
  fish: { ears: 'none', tail: 'puff', muzzle: 'small', body: 'round', eyes: 'round', gait: 'biped', whiskers: false, coat: 'orange' },
  lizard: { ears: 'none', tail: 'long', muzzle: 'snout', body: 'round', eyes: 'slit', gait: 'quadruped', whiskers: false, coat: 'lime' },
  dragon: { ears: 'horns', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'slit', gait: 'quadruped', whiskers: false, coat: 'red' },
  dinosaur: { ears: 'none', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'slit', gait: 'biped', whiskers: false, coat: 'green' },
  monster: { ears: 'horns', tail: 'long', muzzle: 'snout', body: 'tall', eyes: 'slit', gait: 'biped', whiskers: false, coat: 'purple' },
  robot: { ears: 'antenna', tail: 'none', muzzle: 'none', body: 'boxy', eyes: 'screen', gait: 'biped', whiskers: false, coat: 'silver' },
  ghost: { ears: 'none', tail: 'none', muzzle: 'none', body: 'tall', eyes: 'round', gait: 'biped', whiskers: false, coat: 'white' },
  alien: { ears: 'antenna', tail: 'none', muzzle: 'none', body: 'tall', eyes: 'round', gait: 'biped', whiskers: false, coat: 'lime' },
  blob: { ears: 'none', tail: 'none', muzzle: 'none', body: 'round', eyes: 'round', gait: 'biped', whiskers: false, coat: 'mint' },
  // no coat: a shapeless "some animal" reading, so the hash still picks a colour
  creature: { ears: 'round', tail: 'stub', muzzle: 'small', body: 'round', eyes: 'round', gait: 'quadruped', whiskers: false },
};

/**
 * Other words for the shapes above. This is where most prompts actually land —
 * people ask for a corgi or a tiger far more often than for "a dog" or "a cat",
 * and without these they used to fall through to a random animal.
 */
const ALIASES: Record<string, readonly string[]> = {
  cat: ['kitten', 'kitty', 'tabby', 'calico', 'tiger', 'lion', 'lioness', 'leopard', 'cheetah', 'panther', 'lynx', 'cougar', 'jaguar', 'ocelot', 'bobcat'],
  dog: ['puppy', 'puppies', 'pup', 'pupper', 'doggo', 'doggy', 'hound', 'corgi', 'husky', 'shiba', 'inu', 'akita', 'retriever', 'labrador', 'beagle', 'poodle', 'dachshund', 'terrier', 'pug', 'chihuahua', 'spaniel', 'collie', 'dalmatian', 'doberman', 'rottweiler', 'mastiff', 'samoyed', 'malamute', 'greyhound', 'schnauzer', 'shepherd', 'pomeranian', 'bulldog'],
  fox: ['kitsune', 'vixen'],
  wolf: ['wolves', 'coyote', 'jackal', 'dingo', 'werewolf'],
  bear: ['grizzly', 'koala', 'sloth', 'polar bear', 'wombat'],
  panda: ['panda bear'],
  rabbit: ['bunny', 'bunnies', 'hare', 'jackrabbit'],
  mouse: ['mice', 'rat', 'gerbil', 'chinchilla', 'vole', 'shrew', 'mole'],
  hamster: ['guinea pig', 'capybara'],
  squirrel: ['chipmunk', 'beaver'],
  hedgehog: ['porcupine', 'echidna', 'armadillo'],
  raccoon: ['racoon', 'possum', 'opossum', 'badger', 'skunk', 'ferret', 'weasel', 'otter', 'stoat', 'red panda'],
  kangaroo: ['wallaby', 'joey'],
  pig: ['piglet', 'hog', 'boar', 'warthog'],
  cow: ['calf', 'bull', 'ox', 'buffalo', 'bison', 'yak'],
  sheep: ['lamb', 'ram', 'alpaca', 'llama'],
  horse: ['pony', 'foal', 'mare', 'stallion', 'zebra', 'donkey', 'mule', 'camel', 'giraffe'],
  deer: ['fawn', 'stag', 'elk', 'moose', 'reindeer', 'antelope', 'gazelle', 'caribou'],
  unicorn: ['pegasus', 'alicorn'],
  elephant: ['mammoth', 'rhino', 'rhinoceros', 'hippo', 'hippopotamus'],
  monkey: ['ape', 'gorilla', 'chimp', 'chimpanzee', 'orangutan', 'baboon', 'lemur', 'gibbon'],
  bird: ['chicken', 'chick', 'hen', 'rooster', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'crow', 'raven', 'sparrow', 'finch', 'robin', 'eagle', 'hawk', 'falcon', 'pigeon', 'dove', 'swan', 'goose', 'geese', 'flamingo', 'toucan', 'seagull', 'gull', 'peacock', 'magpie', 'canary', 'jay', 'blue jay', 'ostrich', 'emu', 'kiwi', 'dodo', 'turkey', 'pelican', 'stork', 'heron', 'phoenix', 'hummingbird'],
  penguin: ['puffin'],
  duck: ['duckling', 'mallard', 'platypus'],
  frog: ['toad', 'tadpole'],
  turtle: ['tortoise', 'terrapin', 'seal', 'walrus', 'sea lion'],
  // not "salmon" — far more often used as a colour ("a salmon pink cat")
  fish: ['goldfish', 'koi', 'shark', 'whale', 'dolphin', 'guppy', 'betta', 'minnow'],
  lizard: ['gecko', 'iguana', 'chameleon', 'salamander', 'newt', 'komodo', 'snake', 'serpent', 'python', 'cobra', 'viper', 'axolotl'],
  dragon: ['wyvern', 'drake', 'dragonling'],
  dinosaur: ['dino', 't-rex', 't rex', 'trex', 'raptor', 'velociraptor', 'stegosaurus', 'triceratops', 'brontosaurus', 'pterodactyl'],
  robot: ['bot', 'android', 'droid', 'mech', 'mecha', 'automaton', 'cyborg', 'machine'],
  ghost: ['spirit', 'phantom', 'specter', 'spectre', 'wraith', 'poltergeist', 'banshee', 'skeleton', 'mummy'],
  alien: ['martian', 'extraterrestrial', 'ufo'],
  blob: ['slime', 'goo', 'gel', 'jelly', 'ooze', 'glob', 'pudding', 'marshmallow', 'bubble', 'octopus', 'jellyfish', 'kraken'],
  monster: ['beast', 'demon', 'devil', 'imp', 'goblin', 'gremlin', 'troll', 'ogre', 'yeti', 'bigfoot', 'kaiju', 'fiend', 'mutant', 'chimera', 'golem'],

  // people
  person: ['human', 'somebody', 'someone', 'people', 'folk', 'character', 'adult', 'individual'],
  man: ['guy', 'dude', 'gentleman', 'male', 'father', 'dad', 'grandpa', 'grandad', 'uncle', 'brother', 'son', 'husband', 'mister', 'bloke'],
  woman: ['lady', 'gal', 'female', 'mother', 'mom', 'mum', 'grandma', 'granny', 'aunt', 'sister', 'daughter', 'wife', 'madam'],
  boy: ['kid', 'child', 'lad', 'youngster', 'teen', 'teenager', 'schoolboy'],
  girl: ['lass', 'schoolgirl'],
  baby: ['infant', 'toddler', 'newborn'],
  programmer: ['coder', 'developer', 'dev', 'hacker', 'engineer', 'software engineer'],
  doctor: ['physician', 'surgeon', 'medic'],
  chef: ['cook', 'baker', 'barista'],
  artist: ['painter', 'illustrator', 'designer', 'sculptor'],
  musician: ['singer', 'guitarist', 'rockstar', 'bard', 'drummer', 'pianist'],
  scientist: ['researcher', 'chemist', 'physicist', 'inventor', 'biologist'],
  knight: ['paladin', 'crusader'],
  wizard: ['mage', 'sorcerer', 'warlock', 'magician', 'druid', 'necromancer'],
  witch: ['sorceress', 'enchantress'],
  soldier: ['warrior', 'fighter', 'guard', 'trooper', 'marine', 'gladiator'],
  builder: ['carpenter', 'plumber', 'mechanic', 'construction worker', 'worker', 'handyman', 'firefighter', 'fireman'],
  farmer: ['gardener', 'rancher', 'shepherd boy'],
  teacher: ['professor', 'lecturer', 'tutor', 'librarian'],
  student: ['pupil', 'scholar'],
  detective: ['sheriff', 'inspector', 'spy', 'agent', 'policeman', 'police officer', 'cop', 'officer'],
  astronaut: ['spaceman', 'cosmonaut'],
  cowboy: ['cowgirl', 'ranger', 'outlaw', 'gunslinger'],
  pirate: ['buccaneer', 'corsair'],
  monk: ['priest', 'nun', 'cleric', 'shaman', 'monkish'],
  businessman: ['businesswoman', 'boss', 'ceo', 'manager', 'executive', 'banker', 'lawyer', 'accountant'],
  superhero: ['hero', 'heroine', 'superman', 'superwoman'],
  ninja: ['assassin', 'shinobi'],
  vampire: ['dracula'],
  zombie: ['undead'],
  santa: ['father christmas', 'saint nick'],
};

/**
 * People, and roles that are mostly a costume.
 *
 * These are the same kind of data as the animals above, but on the humanoid
 * skeleton, and they show why parts beat presets: a wizard is not a new body,
 * it is a robe, a pointed hat, a staff and a long beard. Every field here is
 * one the prompt can also set directly, so "a wizard with a red hat" works
 * without a "red-hatted wizard" entry existing.
 */
const PEOPLE: Record<string, SpeciesPreset> = {
  person: {},
  man: { hair: 'short' },
  woman: { hair: 'long' },
  boy: { hair: 'short' },
  girl: { hair: 'ponytail' },
  baby: { hair: 'none', body: 'round' },
  wizard: { hair: 'long', facialHair: 'beard', outfit: 'robe', hat: 'wizard', held: 'staff', hairCoat: 'silver', clothCoat: 'indigo' },
  witch: { hair: 'long', outfit: 'robe', hat: 'wizard', held: 'staff', hairCoat: 'black', clothCoat: 'purple' },
  knight: { outfit: 'armour', hat: 'helmet', held: 'sword', clothCoat: 'silver' },
  king: { hair: 'long', facialHair: 'beard', outfit: 'robe', hat: 'crown', clothCoat: 'crimson' },
  queen: { hair: 'long', outfit: 'dress', hat: 'crown', clothCoat: 'violet' },
  prince: { hair: 'short', outfit: 'suit', hat: 'crown', clothCoat: 'navy' },
  princess: { hair: 'long', outfit: 'dress', hat: 'crown', clothCoat: 'pink' },
  chef: { outfit: 'apron', hat: 'chef', clothCoat: 'white' },
  doctor: { outfit: 'labcoat', clothCoat: 'white' },
  nurse: { hair: 'bun', outfit: 'labcoat', clothCoat: 'mint' },
  scientist: { hair: 'spiky', outfit: 'labcoat', glasses: true, clothCoat: 'white' },
  programmer: { hair: 'short', outfit: 'hoodie', glasses: true, held: 'laptop', clothCoat: 'charcoal' },
  artist: { hair: 'bun', outfit: 'apron', clothCoat: 'teal' },
  musician: { hair: 'long', outfit: 'plain', clothCoat: 'purple' },
  pirate: { hair: 'long', facialHair: 'beard', outfit: 'plain', hat: 'cap', held: 'sword', clothCoat: 'crimson' },
  ninja: { hair: 'none', outfit: 'plain', hat: 'beanie', held: 'sword', clothCoat: 'charcoal' },
  samurai: { hair: 'bun', outfit: 'armour', held: 'sword', clothCoat: 'crimson' },
  viking: { hair: 'long', facialHair: 'beard', outfit: 'armour', hat: 'helmet', held: 'sword', hairCoat: 'ginger', clothCoat: 'brown' },
  cowboy: { outfit: 'plain', hat: 'cap', clothCoat: 'tan' },
  farmer: { outfit: 'apron', hat: 'cap', held: 'wrench', clothCoat: 'olive' },
  soldier: { outfit: 'armour', hat: 'helmet', clothCoat: 'olive' },
  astronaut: { outfit: 'armour', hat: 'helmet', clothCoat: 'white' },
  detective: { outfit: 'suit', hat: 'tophat', clothCoat: 'brown' },
  teacher: { hair: 'bun', outfit: 'suit', glasses: true, held: 'book', clothCoat: 'navy' },
  student: { hair: 'short', outfit: 'hoodie', held: 'book', clothCoat: 'blue' },
  builder: { outfit: 'apron', hat: 'helmet', held: 'wrench', clothCoat: 'amber' },
  monk: { hair: 'none', outfit: 'robe', clothCoat: 'orange' },
  elf: { ears: 'pointed', hair: 'long', outfit: 'robe', hairCoat: 'gold', clothCoat: 'forest' },
  dwarf: { facialHair: 'beard', outfit: 'armour', hat: 'helmet', held: 'wrench', hairCoat: 'ginger', clothCoat: 'brown' },
  fairy: { hair: 'long', outfit: 'dress', hairCoat: 'pink', clothCoat: 'mint' },
  angel: { hair: 'long', outfit: 'robe', hairCoat: 'gold', clothCoat: 'white' },
  superhero: { outfit: 'armour', held: 'none', clothCoat: 'red' },
  businessman: { outfit: 'suit', clothCoat: 'charcoal' },
  vampire: { hair: 'short', outfit: 'suit', hairCoat: 'black', clothCoat: 'black', coat: 'porcelain' },
  zombie: { hair: 'spiky', outfit: 'plain', hairCoat: 'charcoal', clothCoat: 'olive', coat: 'sage' },
  santa: { facialHair: 'beard', hair: 'short', outfit: 'robe', hat: 'beanie', hairCoat: 'white', clothCoat: 'red' },
};

/**
 * Aliases that share a shape but not a look. A tiger is built like a cat, and
 * the thing that makes it a tiger rather than an orange cat is the stripes.
 */
const VARIANTS: Record<string, { coat?: string; pattern?: PatternKind; hairCoat?: string; clothCoat?: string }> = {
  tiger: { coat: 'orange', pattern: 'stripes' },
  zebra: { coat: 'white', pattern: 'stripes' },
  leopard: { coat: 'gold', pattern: 'spots' },
  jaguar: { coat: 'gold', pattern: 'spots' },
  cheetah: { coat: 'sand', pattern: 'spots' },
  ocelot: { coat: 'sand', pattern: 'spots' },
  bobcat: { coat: 'tan', pattern: 'spots' },
  lynx: { coat: 'grey', pattern: 'spots' },
  dalmatian: { coat: 'white', pattern: 'spots' },
  fawn: { coat: 'tan', pattern: 'spots' },
  panther: { coat: 'charcoal' },
  lion: { coat: 'amber' },
  lioness: { coat: 'amber' },
  calico: { coat: 'cream', pattern: 'patch' },
  tabby: { coat: 'brown', pattern: 'stripes' },
  husky: { coat: 'grey', pattern: 'patch' },
  malamute: { coat: 'grey', pattern: 'patch' },
  badger: { coat: 'grey', pattern: 'patch' },
  skunk: { coat: 'black', pattern: 'patch' },
  koala: { coat: 'slate' },
  grizzly: { coat: 'brown' },
  'polar bear': { coat: 'white' },
  corgi: { coat: 'ginger' },
  shiba: { coat: 'ginger' },
  inu: { coat: 'ginger' },
  poodle: { coat: 'cream' },
  pug: { coat: 'tan' },
  beagle: { coat: 'white', pattern: 'patch' },
  chick: { coat: 'yellow' },
  crow: { coat: 'black' },
  raven: { coat: 'black' },
  swan: { coat: 'white' },
  flamingo: { coat: 'pink' },
  parrot: { coat: 'lime' },
  dove: { coat: 'white' },
  rat: { coat: 'charcoal' },
  bull: { coat: 'brown' },
  giraffe: { coat: 'gold', pattern: 'spots' },
  camel: { coat: 'sand' },
  'red panda': { coat: 'ginger', pattern: 'patch' },
  wombat: { coat: 'brown' },
  capybara: { coat: 'brown' },
  seal: { coat: 'slate' },
  walrus: { coat: 'brown' },
  platypus: { coat: 'brown' },
  phoenix: { coat: 'orange' },
  zombie: { coat: 'sage' },
  vampire: { coat: 'charcoal' },
  mummy: { coat: 'beige' },
  kiwi: { coat: 'brown' },
  ostrich: { coat: 'charcoal' },
  octopus: { coat: 'magenta' },
  jellyfish: { coat: 'lilac' },
  goldfish: { coat: 'gold' },
  koi: { coat: 'white', pattern: 'patch' },
  shark: { coat: 'slate' },
  whale: { coat: 'navy' },
  dolphin: { coat: 'sky' },
  snake: { coat: 'emerald', pattern: 'stripes' },
  python: { coat: 'olive', pattern: 'spots' },
  cobra: { coat: 'olive' },
  viper: { coat: 'olive', pattern: 'spots' },
  axolotl: { coat: 'pink' },
  gecko: { coat: 'lime', pattern: 'spots' },
  chameleon: { coat: 'emerald' },
  slime: { coat: 'lime' },
  demon: { coat: 'crimson' },
  devil: { coat: 'crimson' },
  goblin: { coat: 'green' },
  yeti: { coat: 'white' },
  bigfoot: { coat: 'brown' },
};

/**
 * Words that mean "an animal" without saying which. Only consulted once no
 * specific word has matched, so "a pet dragon" is still a dragon.
 */
const GENERIC: Record<string, readonly string[]> = {
  creature: ['creature', 'critter', 'animal', 'pet', 'buddy', 'friend', 'companion', 'mascot', 'familiar', 'thing', 'fella', 'sidekick'],
};

const COLOURS: Record<string, RGBA> = {
  red: [222, 74, 62, 255],
  crimson: [198, 50, 62, 255],
  scarlet: [226, 62, 58, 255],
  maroon: [158, 62, 70, 255],
  burgundy: [146, 54, 74, 255],
  orange: [240, 145, 63, 255],
  ginger: [232, 128, 54, 255],
  rust: [196, 106, 58, 255],
  copper: [206, 122, 70, 255],
  bronze: [190, 138, 78, 255],
  amber: [240, 170, 60, 255],
  yellow: [240, 205, 78, 255],
  gold: [232, 186, 74, 255],
  mustard: [216, 176, 62, 255],
  blonde: [230, 200, 140, 255],
  lime: [154, 214, 88, 255],
  green: [104, 190, 106, 255],
  olive: [146, 158, 82, 255],
  sage: [150, 182, 146, 255],
  forest: [72, 142, 92, 255],
  emerald: [70, 182, 130, 255],
  mint: [140, 224, 190, 255],
  teal: [76, 190, 190, 255],
  turquoise: [78, 200, 194, 255],
  aqua: [110, 210, 214, 255],
  cyan: [92, 206, 226, 255],
  sky: [126, 194, 234, 255],
  blue: [92, 154, 226, 255],
  navy: [78, 108, 178, 255],
  midnight: [70, 92, 150, 255],
  indigo: [118, 116, 214, 255],
  periwinkle: [146, 152, 228, 255],
  purple: [162, 122, 220, 255],
  violet: [176, 130, 226, 255],
  lavender: [196, 172, 234, 255],
  lilac: [204, 178, 232, 255],
  magenta: [216, 108, 194, 255],
  fuchsia: [226, 116, 190, 255],
  pink: [238, 146, 182, 255],
  blush: [240, 172, 190, 255],
  rose: [232, 128, 152, 255],
  rosy: [234, 146, 160, 255],
  coral: [240, 142, 122, 255],
  peach: [244, 178, 146, 255],
  salmon: [238, 154, 134, 255],
  brown: [166, 118, 78, 255],
  chocolate: [138, 98, 70, 255],
  chestnut: [156, 104, 74, 255],
  caramel: [200, 148, 92, 255],
  tan: [216, 176, 122, 255],
  sand: [226, 200, 156, 255],
  beige: [228, 208, 176, 255],
  cream: [238, 216, 178, 255],
  ivory: [242, 232, 210, 255],
  white: [236, 238, 242, 255],
  snow: [242, 244, 248, 255],
  grey: [166, 176, 186, 255],
  gray: [166, 176, 186, 255],
  slate: [142, 154, 168, 255],
  ash: [180, 186, 192, 255],
  silver: [190, 198, 208, 255],
  black: [86, 92, 100, 255],
  ebony: [78, 84, 92, 255],
  onyx: [80, 86, 96, 255],
  jet: [82, 88, 96, 255],
  charcoal: [104, 110, 120, 255],
};

/**
 * Skin tones, kept in the same table as the coats so "a tan cat" and "tan
 * skin" resolve the same way.
 */
const SKIN: Record<string, RGBA> = {
  porcelain: [246, 217, 192, 255],
  pale: [244, 212, 188, 255],
  fair: [238, 200, 172, 255],
  light: [226, 184, 150, 255],
  medium: [212, 168, 130, 255],
  olive: [198, 160, 116, 255],
  tan: [206, 158, 120, 255],
  brown: [160, 114, 80, 255],
  dark: [136, 94, 66, 255],
  deep: [124, 84, 58, 255],
  ebony: [92, 62, 44, 255],
};

/** The words that mean a skin tone rather than a paint colour. */
const SKIN_WORDS = new Set(Object.keys(SKIN));

/**
 * Words about where someone is from, as a starting skin and hair colour.
 *
 * This is a character creator, so it works the way one should: these set two
 * colours and nothing else. Every person is drawn on the same body with the
 * same face, and any prompt that names a skin or hair colour outright
 * overrides what is here.
 */
const ORIGINS: Record<string, { skin: string; hair: string }> = {
  asian: { skin: 'light', hair: 'black' },
  'east asian': { skin: 'light', hair: 'black' },
  chinese: { skin: 'light', hair: 'black' },
  japanese: { skin: 'light', hair: 'black' },
  korean: { skin: 'light', hair: 'black' },
  vietnamese: { skin: 'light', hair: 'black' },
  filipino: { skin: 'tan', hair: 'black' },
  thai: { skin: 'tan', hair: 'black' },
  'south asian': { skin: 'brown', hair: 'black' },
  indian: { skin: 'brown', hair: 'black' },
  pakistani: { skin: 'brown', hair: 'black' },
  black: { skin: 'deep', hair: 'black' },
  african: { skin: 'deep', hair: 'black' },
  'african american': { skin: 'deep', hair: 'black' },
  nigerian: { skin: 'ebony', hair: 'black' },
  ethiopian: { skin: 'deep', hair: 'black' },
  caribbean: { skin: 'deep', hair: 'black' },
  white: { skin: 'fair', hair: 'brown' },
  european: { skin: 'fair', hair: 'brown' },
  caucasian: { skin: 'fair', hair: 'brown' },
  irish: { skin: 'porcelain', hair: 'ginger' },
  nordic: { skin: 'porcelain', hair: 'blonde' },
  scandinavian: { skin: 'porcelain', hair: 'blonde' },
  latino: { skin: 'tan', hair: 'black' },
  latina: { skin: 'tan', hair: 'black' },
  hispanic: { skin: 'tan', hair: 'black' },
  mexican: { skin: 'tan', hair: 'black' },
  brazilian: { skin: 'tan', hair: 'brown' },
  'middle eastern': { skin: 'olive', hair: 'black' },
  arab: { skin: 'olive', hair: 'black' },
  persian: { skin: 'olive', hair: 'black' },
  turkish: { skin: 'olive', hair: 'black' },
  'native american': { skin: 'tan', hair: 'black' },
  polynesian: { skin: 'brown', hair: 'black' },
  'pacific islander': { skin: 'brown', hair: 'black' },
};

/**
 * How English says "someone who does a thing".
 *
 * This is the rule that stops the vocabulary being a list to be extended for
 * ever. No table will ever contain `basketball player`, `taxi driver`,
 * `shopkeeper` and `electrician`, but all four are marked as people by their
 * own shape, and there is no end to the words this covers.
 */
const PERSON_SUFFIXES = [
  'keeper',
  'monger',
  'smith',
  'wright',
  'eer',
  'ist',
  'ian',
  'ster',
  'er',
  'or',
];

/**
 * Words that end like a person but are not one. Only the common ones are
 * needed: anything already in the vocabulary (tiger, otter, silver, ginger)
 * is matched long before this rule is consulted.
 */
const NOT_PEOPLE = new Set([
  'flower', 'water', 'computer', 'number', 'paper', 'river', 'corner', 'dinner', 'summer', 'winter',
  'weather', 'leather', 'feather', 'letter', 'matter', 'butter', 'ladder', 'shoulder', 'finger',
  'mirror', 'motor', 'tractor', 'elevator', 'monitor', 'sensor', 'tower', 'power', 'cover', 'colour',
  'color', 'spider', 'lobster', 'oyster', 'burger', 'hamburger', 'sticker', 'poster', 'folder',
  'marker', 'cracker', 'blender', 'toaster', 'sweater', 'slipper', 'sneaker', 'container', 'chapter',
  'theater', 'theatre', 'center', 'centre', 'order', 'border', 'flavour', 'flavor', 'anchor',
  'armour', 'armor', 'humour', 'humor', 'error', 'terror', 'horror', 'mirror', 'liquor', 'major',
  'minor', 'senior', 'junior', 'interior', 'exterior', 'wrist', 'twist', 'exist', 'resist', 'assist',
  'forest', 'honest', 'modest', 'nearest', 'larger', 'smaller', 'bigger', 'better', 'other', 'either',
  'over', 'under', 'super', 'silver', 'clever', 'tender', 'slender', 'wonder', 'thunder', 'glitter',
  'sticker', 'glimmer', 'shimmer', 'creature', 'picture', 'nature', 'future', 'lantern', 'guitar',
]);

/**
 * Read the prompt as a person if any word is shaped like an occupation.
 * Returns the word that gave it away, so the caller can say what it assumed.
 */
function personFromShape(text: string): string | undefined {
  for (const word of text.match(/[a-z][a-z-]{4,}/g) ?? []) {
    if (NOT_PEOPLE.has(word) || FILLER.has(word)) continue;
    if (PERSON_SUFFIXES.some((s) => word.endsWith(s))) return word;
  }
  return undefined;
}

/** Escape a vocabulary word so it can go straight into an alternation. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a matcher over a word list.
 *
 * Longest term first, so "guinea pig" beats "pig"; the regex engine scans left
 * to right, so the earliest word in the sentence wins — "a robot with bunny
 * ears" is a robot. `suffix` absorbs the endings a word can pick up ("golden"
 * for gold, "penguins" for penguin) without needing an entry for each.
 */
interface Hit {
  term: string;
  key: string;
  /** Where the whole match sat, so the caller can take those words out of play. */
  start: number;
  end: number;
}

function matcherFor(terms: Record<string, string>, suffix: string): (text: string) => Hit | undefined {
  const words = Object.keys(terms)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  const re = new RegExp(`\\b(${words.join('|')})${suffix}\\b`);
  return (text) => {
    const m = re.exec(text);
    if (!m) return undefined;
    const term = m[1]!;
    return { term, key: terms[term]!, start: m.index, end: m.index + m[0].length };
  };
}

function invert(groups: Record<string, readonly string[]>, base: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of base) out[key] = key;
  for (const [key, words] of Object.entries(groups)) {
    for (const w of words) out[w] = key;
  }
  return out;
}

/**
 * Everything that can be drawn, animals and people alike, each filled out from
 * the defaults for its build so a preset only has to say what makes it
 * distinctive.
 */
const SHAPES: Record<string, SpeciesPreset> = {
  ...Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, { ...BEAST_DEFAULTS, ...v }])),
  ...Object.fromEntries(Object.entries(PEOPLE).map(([k, v]) => [k, { ...HUMAN_DEFAULTS, ...v }])),
};

// "creature" is a preset but not a specific word, so it is matched in the
// second tier only — otherwise it would win over the dragon in "a creature
// with a dragon's head".
const SPECIFIC = Object.keys(SHAPES).filter((k) => !Object.keys(GENERIC).includes(k));
const SPECIES_TERMS = invert(ALIASES, SPECIFIC);
const GENERIC_TERMS = invert(GENERIC);
/**
 * "dark green" has to beat "dark", or every shaded colour collapses to the
 * modifier. Generating the pairs keeps them consistent with the base colours
 * instead of drifting as hand-written entries would.
 */
const SHADED: Record<string, RGBA> = {};
for (const [name, c] of Object.entries(COLOURS)) {
  SHADED[`dark ${name}`] = darken(c, 0.3);
  SHADED[`deep ${name}`] = darken(c, 0.38);
  SHADED[`light ${name}`] = lighten(c, 0.32);
  SHADED[`pale ${name}`] = lighten(c, 0.5);
  SHADED[`bright ${name}`] = lighten(c, 0.12);
}

const COLOUR_TERMS = invert({}, [...Object.keys(COLOURS), ...Object.keys(SKIN), ...Object.keys(SHADED)]);
const ORIGIN_TERMS = invert({}, Object.keys(ORIGINS));

const matchSpecies = matcherFor(SPECIES_TERMS, '(?:e?s)?');
const matchGeneric = matcherFor(GENERIC_TERMS, '(?:e?s)?');
const matchColour = matcherFor(COLOUR_TERMS, '(?:ish|y|en)?');
const matchOrigin = matcherFor(ORIGIN_TERMS, '');

/**
 * Resolve a colour word for a slot. "tan" is a warmer colour on skin than in
 * paint, so the same word has to land differently on a person and on a cat,
 * and either table can cover a word the other has never heard of.
 */
function coatColour(name: string, asSkin: boolean): RGBA | undefined {
  const paint = COLOURS[name] ?? SHADED[name];
  return asSkin ? (SKIN[name] ?? paint) : (paint ?? SKIN[name]);
}

/**
 * Hair wants its own values. The coat "black" is a soft blue-grey on purpose,
 * so it reads as fur rather than a hole, but hair that colour looks washed out.
 */
const HAIR_COLOURS: Record<string, RGBA> = {
  black: [44, 42, 50, 255],
  charcoal: [62, 62, 70, 255],
  brown: [92, 62, 44, 255],
  chestnut: [118, 72, 48, 255],
  ginger: [196, 104, 48, 255],
  red: [176, 74, 52, 255],
  grey: [156, 158, 166, 255],
  gray: [156, 158, 166, 255],
  silver: [190, 194, 202, 255],
  white: [234, 236, 240, 255],
};

const hairColour = (name: string): RGBA | undefined => HAIR_COLOURS[name] ?? COLOURS[name];

/** Nouns that mean "this colour is what it is wearing", not what it is. */
const CLOTH_NOUNS =
  'shirt|t-?shirt|top|jacket|coat|lab ?coat|hoodie|jumper|sweater|suit|tuxedo|dress|skirt|gown|robes?|cloak|cape|kimono|apron|overalls|armou?r|uniform|scrubs|clothes|outfit|trousers|pants|jeans|hat|cap|helmet|beanie|scarf|tie';

/** Clothing to fall back on when nothing says otherwise — muted, never garish. */
const CLOTH_DEFAULTS: readonly RGBA[] = [
  [92, 122, 168, 255],
  [122, 132, 148, 255],
  [156, 106, 96, 255],
  [96, 140, 124, 255],
  [136, 116, 156, 255],
];

const COLOUR_ALT = Object.keys(COLOUR_TERMS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join('|');

/**
 * Find a colour that is attached to one of `nouns` — "long red hair", "in a
 * blue suit". Returns where it sat so the caller can take it out of play
 * before looking for a colour that belongs to the character itself.
 */
function colourBeside(text: string, nouns: string): Hit | undefined {
  const re = new RegExp(`\\b(${COLOUR_ALT})(?:ish|y|en)?\\b[a-z\\s-]{0,12}?\\b(?:${nouns})\\b`);
  const m = re.exec(text);
  if (!m) return undefined;
  return { term: m[1]!, key: m[1]!, start: m.index, end: m.index + m[0].length };
}

/** Every shape the generator knows, animals and people, for showing examples. */
export const KNOWN_SPECIES: readonly string[] = Object.keys(SHAPES).sort();

/** Every animal word the parser understands, aliases included. */
export const KNOWN_WORDS: readonly string[] = [...Object.keys(SPECIES_TERMS), ...Object.keys(GENERIC_TERMS)].sort();

/** Every colour word the parser understands. */
export const KNOWN_COLOURS: readonly string[] = Object.keys(COLOURS).sort();

const EAR_WORDS: Array<[RegExp, EarKind]> = [
  [/\b(floppy|droopy) ears?\b|\bfloppy\b/, 'floppy'],
  [/\b(pointy|pointed|sharp|cat) ears?\b/, 'pointed'],
  [/\b(long|tall|big|bunny|rabbit) ears?\b/, 'tall'],
  [/\bround ears?\b/, 'round'],
  [/\bhorns?\b|\bhorned\b|\bantlers?\b/, 'horns'],
  [/\bantennae?\b/, 'antenna'],
  [/\bno ears?\b|\bearless\b/, 'none'],
];

const HAIR_WORDS: Array<[RegExp, HairKind]> = [
  [/\bbald\b|\bshaved head\b|\bno hair\b/, 'none'],
  [/\bafro\b|\bcurly hair\b/, 'afro'],
  [/\bponytail\b|\bpony tail\b|\bpigtails?\b|\bbraids?\b|\bbraided hair\b/, 'ponytail'],
  [/\bbob\b|\bbobbed hair\b/, 'bob'],
  [/\bbun\b|\btopknot\b|\bhair up\b/, 'bun'],
  [/\bspiky hair\b|\bspikey hair\b|\bmessy hair\b|\bspiked hair\b/, 'spiky'],
  [/\blong hair\b|\blong-haired\b|\bflowing hair\b/, 'long'],
  [/\bshort hair\b|\bcropped hair\b|\bbuzz cut\b/, 'short'],
];

const FACIAL_HAIR_WORDS: Array<[RegExp, FacialHairKind]> = [
  [/\bbeard(ed)?\b|\bgoatee\b|\bstubble\b/, 'beard'],
  [/\bmoustache\b|\bmustache\b/, 'moustache'],
  [/\bclean shaven\b|\bclean-shaven\b/, 'none'],
];

const OUTFIT_WORDS: Array<[RegExp, OutfitKind]> = [
  [/\blab ?coat\b|\bscrubs\b/, 'labcoat'],
  [/\barmou?r(ed)?\b|\bchain ?mail\b|\bplate ?mail\b|\bspace ?suit\b/, 'armour'],
  [/\bhoodie\b|\bhooded\b|\bsweatshirt\b|\bjumper\b/, 'hoodie'],
  [/\bapron\b|\boveralls\b|\bdungarees\b/, 'apron'],
  [/\brobe[sd]?\b|\bcloak\b|\bcape\b|\bkimono\b|\bgown\b/, 'robe'],
  [/\bdress\b|\bskirt\b/, 'dress'],
  [/\bsuit\b|\btuxedo\b|\bblazer\b|\bbusiness attire\b/, 'suit'],
  [/\bshirt\b|\bt-?shirt\b|\btop\b|\bjacket\b|\bplain clothes\b/, 'plain'],
];

const HAT_WORDS: Array<[RegExp, HatKind]> = [
  [/\bwizard hat\b|\bpointy hat\b|\bpointed hat\b|\bwitch hat\b/, 'wizard'],
  [/\bchef('?s)? hat\b|\btoque\b/, 'chef'],
  [/\btop ?hat\b/, 'tophat'],
  [/\bcrown\b|\btiara\b/, 'crown'],
  [/\bhelmet\b|\bhard ?hat\b/, 'helmet'],
  [/\bbeanie\b|\bwool(l?y)? hat\b|\bknit hat\b|\bbandana\b/, 'beanie'],
  [/\bcap\b|\bbaseball hat\b|\bcowboy hat\b|\bhat\b/, 'cap'],
  [/\bno hat\b|\bbare ?head(ed)?\b/, 'none'],
];

const HELD_WORDS: Array<[RegExp, HeldKind]> = [
  // an activity implies its prop: "a basketball player" carries a ball
  [/\b(basket|foot|volley|base|soft|hand|net)?ball(er|ers)?\b|\bsoccer\b|\btennis\b|\bbowling\b/, 'ball'],
  [/\bguitar(ist)?\b|\bbass\b|\bukulele\b|\bbanjo\b|\bmusic\b/, 'guitar'],
  [/\blaptop\b|\bcomputer\b|\bcoding\b|\bprogramming\b|\bkeyboard\b|\bgaming\b/, 'laptop'],
  [/\bsword\b|\bblade\b|\bkatana\b|\bdagger\b|\baxe\b/, 'sword'],
  [/\bstaff\b|\bwand\b|\bcane\b|\bsceptre\b|\bscepter\b/, 'staff'],
  [/\bmug\b|\bcoffee\b|\btea\b|\bcup\b/, 'mug'],
  [/\bbook\b|\btome\b|\bscroll\b|\bnotebook\b/, 'book'],
  [/\bwrench\b|\bspanner\b|\bhammer\b|\btools?\b/, 'wrench'],
  [/\bempty handed\b|\bnothing\b/, 'none'],
];

const PATTERN_WORDS: Array<[RegExp, PatternKind]> = [
  [/\bstripe[sd]?\b|\bstripy\b|\bstriped\b/, 'stripes'],
  [/\bspot(s|ted|ty)?\b|\bdotted\b|\bfreckled\b|\bspeckled\b/, 'spots'],
  [/\bpatch(es|y|ed)?\b|\bmasked\b|\bmarkings?\b/, 'patch'],
  [/\bplain\b|\bsolid\b|\bno markings?\b/, 'none'],
];

const TAIL_WORDS: Array<[RegExp, TailKind]> = [
  [/\b(bushy|fluffy|puffy) tail\b/, 'bushy'],
  [/\b(curled|curly) tail\b/, 'curled'],
  [/\blong tail\b/, 'long'],
  [/\bno tail\b|\btailless\b/, 'none'],
  [/\b(stubby|short|little) tail\b/, 'stub'],
];

/**
 * Index into a list by seed. Normalises the index because a signed shift of a
 * large hash can go negative, which would silently pick `undefined`.
 */
const pick = <T>(list: readonly T[], seed: number): T =>
  list[((Math.trunc(seed) % list.length) + list.length) % list.length]!;

function lighten(c: RGBA, f: number): RGBA {
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * f)));
  return [m(c[0]), m(c[1]), m(c[2]), 255];
}

function darken(c: RGBA, f: number): RGBA {
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - f))));
  return [m(c[0]), m(c[1]), m(c[2]), 255];
}

/** Build a full sprite palette from one coat colour. */
export function paletteFromTraits(traits: Traits): Palette {
  const main = traits.colour;
  return {
    out: darken(main, 0.66),
    dark: darken(main, 0.24),
    main,
    light: lighten(main, 0.26),
    // a warm off-white belly that still reads against very pale coats
    cream: lighten(main, 0.86),
    eyeWhite: [255, 252, 246, 255],
    eyeDark: darken(main, 0.82),
    accent: traits.accent,
    hair: traits.hairColour,
    cloth: traits.clothing,
  };
}

/** A part of the pet the prompt didn't specify, so the hash chose it. */
export type Invented = 'species' | 'colour';

export interface ParsedPrompt {
  traits: Traits;
  /** Words we recognised, for the CLI to echo back. */
  matched: string[];
  /**
   * What we made up because nothing in the prompt described it. An invented
   * species means the result will not resemble what was asked for, so callers
   * should say so rather than present the guess as an answer.
   */
  invented: Invented[];
  /**
   * Readings taken from the shape of a word rather than from a word we know —
   * a good guess, but a guess, and worth showing.
   */
  assumed: string[];
}

/**
 * Parse a description into traits. Unrecognised prompts still produce a valid
 * pet — the hash decides — so this never fails.
 */
export function traitsFromPrompt(prompt: string): ParsedPrompt {
  const text = ` ${prompt.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ')} `;
  const seed = hashString(prompt.trim().toLowerCase());
  const matched: string[] = [];
  const invented: Invented[] = [];
  const assumed: string[] = [];

  // what it is — a specific thing beats a vague one, so "a pet dragon" is a dragon
  const speciesHit = matchSpecies(text) ?? matchGeneric(text);
  if (speciesHit) matched.push(speciesHit.term);

  // Nothing named? A word shaped like an occupation still tells us it is a
  // person, which beats inventing an animal for "a basketball player".
  const shapedWord = speciesHit ? undefined : personFromShape(text);
  // Unless that word is part of something we have an actual picture of: a
  // roller coaster is not someone who rolls. Knowledge beats a guess.
  // Only a multi-word picture wins: "roller coaster" names a thing, whereas a
  // bare "player" being some emoji's keyword says nothing about the sentence.
  const pictured = shapedWord ? findConcept(prompt) : undefined;
  const namesAThing = pictured !== undefined && pictured.term.includes(' ') && pictured.term.split(' ').includes(shapedWord!);
  const shaped = namesAThing ? undefined : shapedWord;
  if (shaped) assumed.push(`${shaped.trim()} sounds like a person`);
  if (!speciesHit && !shaped) invented.push('species');

  const speciesKey = speciesHit?.key ?? (shaped ? 'person' : pick(Object.keys(SHAPES), seed));
  const base = SHAPES[speciesKey]!;
  const variant = speciesHit ? VARIANTS[speciesHit.term] : undefined;
  const humanoid = base.build === 'humanoid';

  // Where someone is from sets a starting skin and hair colour, nothing else.
  const originHit = matchOrigin(text);
  if (originHit) matched.push(originHit.term);
  const origin = originHit ? ORIGINS[originHit.key] : undefined;

  // The thing's own name is not a colour instruction: a red panda is a red
  // panda, not a panda painted red, so take those words out before reading one.
  const colourText = speciesHit ? `${text.slice(0, speciesHit.start)} ${text.slice(speciesHit.end)}` : text;

  // A colour next to a noun belongs to that noun: "red hair" is not a red pet.
  const hairSaid = colourBeside(colourText, 'hair|beard|moustache|mustache');
  const clothSaid = colourBeside(colourText, CLOTH_NOUNS);
  const skinSaid = colourBeside(colourText, 'skin|skinned|complexion');
  const spoken = [hairSaid, clothSaid, skinSaid].filter((h) => h !== undefined);
  // whatever colour is left over, unattached to any noun
  const looseText = spoken.reduce(
    (t, h) => `${t.slice(0, h!.start)} ${t.slice(h!.end)}`,
    colourText,
  );
  const looseHit = matchColour(looseText);
  for (const h of [skinSaid, hairSaid, clothSaid, looseHit]) if (h) matched.push(h.term);

  /**
   * A loose colour paints the thing itself, and what "itself" means depends on
   * the build: a green dragon is green all over, but "a man in green" is
   * dressed in green, not painted green. The exception is a word that is a
   * skin tone — "a tan man" is describing him, not his shirt.
   */
  const looseIsTone = looseHit !== undefined && SKIN_WORDS.has(looseHit.term);
  const looseSlot = humanoid && !looseIsTone ? 'cloth' : 'coat';
  const coatName = skinSaid?.term
    ?? (looseSlot === 'coat' ? looseHit?.term : undefined)
    ?? origin?.skin
    ?? variant?.coat
    ?? base.coat
    ?? '';
  let colourName = coatName;
  if (!colourName) {
    colourName = humanoid ? 'light' : pick(Object.keys(COLOURS), seed >>> 8);
    if (!humanoid) invented.push('colour');
  } else if (!skinSaid && !looseHit && !speciesHit) {
    // a natural coat is only natural if we got the creature right
    invented.push('colour');
  }
  const isSkin = humanoid || skinSaid !== undefined || origin !== undefined;
  const colour = coatColour(colourName, isSkin) ?? COLOURS['grey']!;

  const hairName = hairSaid?.term ?? origin?.hair ?? variant?.hairCoat ?? base.hairCoat ?? '';
  const clothName = clothSaid?.term
    ?? (looseSlot === 'cloth' ? looseHit?.term : undefined)
    ?? variant?.clothCoat
    ?? base.clothCoat
    ?? '';

  const { coat: _c, hairCoat: _h, clothCoat: _cl, pattern: presetPattern, ...shape } = base;
  const traits: Traits = {
    ...BEAST_DEFAULTS,
    ...shape,
    pattern: variant?.pattern ?? presetPattern ?? 'none',
    colour,
    accent: [122, 212, 106, 255],
    // hair defaults to a dark brown that reads against any skin tone
    hairColour: hairColour(hairName) ?? [78, 56, 44, 255],
    clothing: COLOURS[clothName] ?? pick(CLOTH_DEFAULTS, seed >>> 12),
    species: speciesHit?.term ?? speciesKey,
    colourName,
  };

  for (const [re, kind] of HAIR_WORDS) {
    if (re.test(text)) {
      traits.hair = kind;
      matched.push(kind === 'none' ? 'bald' : `${kind} hair`);
      break;
    }
  }
  for (const [re, kind] of FACIAL_HAIR_WORDS) {
    if (re.test(text)) {
      traits.facialHair = kind;
      if (kind !== 'none') matched.push(kind);
      break;
    }
  }
  for (const [re, kind] of OUTFIT_WORDS) {
    if (re.test(text)) {
      traits.outfit = kind;
      matched.push(kind === 'plain' ? 'plain clothes' : kind);
      break;
    }
  }
  for (const [re, kind] of HAT_WORDS) {
    if (re.test(text)) {
      traits.hat = kind;
      if (kind !== 'none') matched.push(`${kind} hat`);
      break;
    }
  }
  for (const [re, kind] of HELD_WORDS) {
    if (re.test(text)) {
      traits.held = kind;
      if (kind !== 'none') matched.push(kind);
      break;
    }
  }
  if (/\b(glasses|spectacles|sunglasses|monocle|specs)\b/.test(text)) {
    traits.glasses = true;
    matched.push('glasses');
  }

  for (const [re, kind] of PATTERN_WORDS) {
    if (re.test(text)) {
      traits.pattern = kind;
      matched.push(kind === 'none' ? 'no markings' : kind);
      break;
    }
  }
  for (const [re, kind] of EAR_WORDS) {
    if (re.test(text)) {
      traits.ears = kind;
      matched.push(`${kind} ears`);
      break;
    }
  }
  for (const [re, kind] of TAIL_WORDS) {
    if (re.test(text)) {
      traits.tail = kind;
      matched.push(`${kind} tail`);
      break;
    }
  }
  if (/\bwhiskers?\b/.test(text)) {
    traits.whiskers = true;
    matched.push('whiskers');
  }
  // "tall ears" describes the ears, not the animal, so don't let it stretch the body
  if (/\b(tall|lanky)\b(?!\s+ears?\b)/.test(text)) traits.body = 'tall';
  if (/\b(boxy|square|blocky)\b/.test(text)) traits.body = 'boxy';
  if (/\b(round|chubby|chonky)\b(?!\s+ears?\b)/.test(text)) traits.body = 'round';

  // eye colour: a complementary accent unless the prompt names one
  const eyeMatch = /\b(green|blue|amber|gold|red|purple|pink|yellow|cyan)\s+eyes?\b/.exec(text);
  if (eyeMatch) {
    traits.accent = COLOURS[eyeMatch[1]!]!;
    matched.push(`${eyeMatch[1]} eyes`);
  } else {
    traits.accent = pick(
      [COLOURS['green']!, COLOURS['amber']!, COLOURS['cyan']!, COLOURS['blue']!, COLOURS['gold']!],
      seed >>> 16,
    );
  }

  // "a black woman" matches black twice, as an origin and as a colour
  return { traits, matched: [...new Set(matched)], invented, assumed };
}

/** How to say what this pet is: "blue jay", not "blue blue jay". */
export function coatLabel(traits: Traits): string {
  if (traits.build === 'humanoid') return traits.species;
  return traits.species.includes(traits.colourName) ? traits.species : `${traits.colourName} ${traits.species}`;
}

/**
 * The parts worth reading back, chosen for the build: nobody wants to be told
 * their wizard has "none ears", and an animal has no outfit to report.
 */
export function featureLabels(traits: Traits): string[] {
  const bits: string[] = [];
  if (traits.build === 'humanoid') {
    if (traits.hair !== 'none') bits.push(`${traits.hair} hair`);
    if (traits.facialHair !== 'none') bits.push(traits.facialHair);
    if (traits.outfit !== 'plain') bits.push(traits.outfit);
  } else {
    if (traits.pattern !== 'none') bits.push(traits.pattern);
    if (traits.ears !== 'none') bits.push(`${traits.ears} ears`);
    if (traits.tail !== 'none') bits.push(`${traits.tail} tail`);
  }
  if (traits.hat !== 'none') bits.push(`${traits.hat} hat`);
  if (traits.glasses) bits.push('glasses');
  if (traits.held !== 'none') bits.push(`holding a ${traits.held}`);
  return bits;
}

const FILLER = new Set([
  'a', 'an', 'the', 'and', 'with', 'of', 'in', 'on', 'that', 'has', 'have', 'is', 'are', 'my', 'some',
  'very', 'really', 'quite', 'wearing', 'wears', 'holding', 'holds', 'called', 'named', 'looks', 'like',
  'who', 'its', 'his', 'her', 'their', 'them', 'they', 'it', 'for', 'to', 'as', 'at', 'by', 'from',
]);

/**
 * Which of your words changed nothing.
 *
 * Found by asking rather than guessing: drop each word and see whether the
 * parse still understands the same things. If it does, that word did no work,
 * and saying so is the difference between a generator that looks like it read
 * your prompt and one you can actually steer.
 */
export function unusedWords(prompt: string): string[] {
  // a word that only told us the build — "player" — did work, so weigh what
  // was assumed alongside what was matched, or the two lines contradict
  const read = (p: string): string[] => {
    const r = traitsFromPrompt(p);
    return [...r.matched, ...r.assumed];
  };
  const full = read(prompt);
  const tokens = prompt.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
  const unused: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]!;
    if (w.length < 3 || FILLER.has(w) || unused.includes(w)) continue;
    const without = read(tokens.filter((_, j) => j !== i).join(' '));
    if (full.length === without.length && full.every((m) => without.includes(m))) unused.push(w);
  }
  return unused;
}

/** A kebab-case id derived from the prompt, for when the user doesn't pass one. */
export function idFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter((w) => !['a', 'an', 'the', 'with', 'and', 'of'].includes(w))
    .slice(0, 3)
    .join('-');
  const safe = slug.replace(/^[^a-z0-9]+/, '').slice(0, 40);
  return safe.length >= 2 ? safe : `pet-${hashString(prompt).toString(36).slice(0, 6)}`;
}

/** A display name derived from the prompt. */
export function nameFromPrompt(prompt: string): string {
  const words = prompt
    .trim()
    .split(/\s+/)
    .filter((w) => !['a', 'an', 'the', 'with', 'and', 'of', 'that', 'has'].includes(w.toLowerCase()))
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ').slice(0, 64) || 'My Pet';
}
