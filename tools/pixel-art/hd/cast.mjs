// 새 도트 인물 설정 (레온·세레나 밖의 파티, 조연, 적). 디자인: docs/캐릭터디자인.md, 기준: docs/도트기준.md
// 예전 생성기(gen-characters.mjs CHARS)의 특징을 그대로 옮기고, 색은 새 팔레트에서 고름.
// battle: 전투 시트 설정 (weapon: 칼 종류 | lunge: 몸을 내밀어 찌름 | cast: 손에서 마력 구슬)
import { RAMPS } from '../palette.mjs';

const R = RAMPS;

// ---- 자주 쓰는 색 묶음 (머리는 [밝음, 기본, 그늘, 어둠, 외곽선·속눈썹]) ----
const HAIR = {
  brown: R.hair,
  dark: [R.hair[1], R.hair[2], R.hair[3], R.hair[4], R.hair[4]],
  grey: [R.ivory[1], R.ash[0], R.ash[1], R.ash[2], R.ash[3]],
  white: [R.white[0], R.white[1], R.white[2], R.white[3], R.white[4]],
  silver: [R.white[1], R.white[2], R.white[3], R.white[4], R.ash[2]],
  pale: [R.ivory[0], R.ivory[1], R.ivory[2], R.ivory[3], R.ivory[4]],
  blond: [R.gold[0], R.gold[1], R.gold[2], R.gold[3], R.wood[3]],
  navy: [R.navy[1], R.navy[2], R.navy[3], R.navy[4], R.navy[4]],
  black: [R.slate[0], R.slate[1], R.slate[2], R.slate[3], R.slate[3]],
  ginger: [R.fire[1], R.fire[2], R.fire[3], R.red[2], R.red[3]],
  wood: [R.wood[0], R.wood[1], R.wood[2], R.wood[3], R.wood[3]],
  sand: [R.sand[1], R.sand[2], R.sand[3], R.wood[2], R.wood[3]],
};
const EYE = {
  brown: [R.wood[1], R.wood[2], R.hair[4]],
  green: [R.green[0], R.green[2], R.green[3]],
  blue: [R.sky[1], R.sky[2], R.sky[3]],
  greyblue: [R.sky[2], R.sky[3], R.hair[4]],
  yellow: [R.gold[0], R.gold[1], R.gold[3]],
  violet: [R.violet[0], R.violet[1], R.violet[3]],
  amber: [R.fire[1], R.fire[2], R.wood[3]],
  grey: [R.ash[0], R.ash[1], R.ash[3]],
};
// 옷 색 묶음 [밝음, 기본, 그늘, 어둠, 외곽선]
const CLOTH = {
  navy: R.navy,
  white: R.white,
  silver: R.white,
  red: [R.red[0], R.red[1], R.red[2], R.red[3], R.red[3]],
  slate: [R.ash[0], R.slate[0], R.slate[1], R.slate[2], R.slate[3]], // 검은 옷도 밝은 회남색이 기본
  grey: [R.white[2], R.ash[0], R.ash[1], R.ash[2], R.ash[3]],
  iron: [R.ash[0], R.ash[1], R.ash[2], R.ash[3], R.ash[4]],
  violet: [R.violet[0], R.violet[1], R.violet[2], R.violet[3], R.violet[4]],
  robe: [R.violet[1], R.violet[2], R.violet[3], R.violet[4], R.violet[4]], // 엘리시아 남보라 로브
  wood: [R.wood[0], R.wood[1], R.wood[2], R.wood[3], R.wood[3]],
  sand: [R.sand[0], R.sand[1], R.sand[2], R.sand[3], R.wood[3]],
  green: [R.green[0], R.green[1], R.green[2], R.green[3], R.green[3]],
  sky: [R.sky[0], R.sky[1], R.sky[2], R.sky[3], R.sky[3]],
  ivory: R.ivory,
  brown: [R.hair[0], R.hair[1], R.hair[2], R.hair[3], R.hair[4]],
  skin: R.skin,
  tan: [R.skin[1], R.skin[2], R.skin[3], R.skin[4], R.skin[4]],
};
const cape = (c) => [c[1], c[1], c[2], c[2], c[3]];
const glowGlove = [R.white[0], R.white[0], R.sky[0], R.sky[1]];

// 공통: 남색 근위 제복
const navyCoat = { cloth: CLOTH.navy, pants: R.slate, shoes: R.slate, glove: R.white, coat: 39, collar: true, belt: R.white, trim: R.silver };
const base = { skin: R.skin, eye: EYE.brown, pants: R.slate, shoes: R.slate, glove: R.skin, weapon: 'sword' };

export const CAST = {
  // ================= 파티 =================
  // 1막 두건 망토 레온: 갈색 두건과 망토
  leon_hood: {
    ...base, ...navyCoat, hair: R.hair, hairStyle: 'short', eye: [R.sky[2], R.sky[3], R.hair[4]], brow: 'sharp',
    plate: true, pauldron: true, buttons: R.gold, hood: CLOTH.wood, cape: cape(CLOTH.wood),
    battle: { weapon: 'sword' },
  },
  // 4막 각인 무기 레온: 필드 모습은 레온과 같음, 전투 무기만 다름
  leon_blade: { like: 'leon', battle: { weapon: 'runesword' } },
  serena_hood: { like: 'serena', capelet: false, hood: CLOTH.wood, cape: cape(CLOTH.wood) },
  elysia: {
    ...base, hair: HAIR.pale, hairStyle: 'long', hairLen: 33, sideLen: 26, eye: EYE.violet, brow: 'soft', blush: true,
    cloth: CLOTH.robe, dress: true, skirtW: 2, runes: [R.sky[0], R.sky[1]], belt: CLOTH.wood, pouch: true, cuff: [R.sky[0], R.sky[1]],
    held: ['staff_twisted'], drop: 2,
    battle: { cast: [R.violet[0], R.violet[1], R.violet[2]] },
  },
  karg: {
    ...base, skin: CLOTH.tan, hair: HAIR.grey, hairStyle: 'short', ears: true, tail: true, eye: EYE.yellow, brow: 'heavy',
    cloth: CLOTH.tan, lower: 'tunic', coat: 37, lowerRamp: CLOTH.sand, pants: CLOTH.grey, shoes: R.slate, glove: CLOTH.tan,
    scarf: CLOTH.grey, necklace: 'teeth', pauldron: true, pauldronRamp: CLOTH.wood, bracer: [R.wood[1], R.wood[2]], belt: CLOTH.wood,
    pose: 'cross',
    battle: { weapon: 'dagger', dual: true },
  },
  adrian: {
    ...base, hair: HAIR.blond, hairStyle: 'slick', eye: EYE.blue, brow: 'plain',
    cloth: CLOTH.silver, armor: true, lower: 'tunic', coat: 36, crossColor: [R.sky[1], R.sky[2]], pauldron: 'both', pauldronTrim: R.sky,
    cape: cape(R.white), glove: R.white, pants: CLOTH.silver, shoes: R.slate, held: ['shield'],
    battle: { weapon: 'sword' },
  },
  galia: {
    ...base, hair: HAIR.dark, hairStyle: 'slick', eye: EYE.green, brow: 'sharp', scar: true,
    cloth: CLOTH.navy, dress: true, skirtW: 1, plate: true, pauldron: 'both', sash: R.red, belt: R.red, glove: R.white,
    cape: [R.navy[2], R.navy[2], R.navy[3], R.navy[3], R.navy[4]], held: ['greatswordBack'], pose: 'hips', drop: 1,
    battle: { weapon: 'greatsword' },
  },

  // ================= 조연 =================
  bram: {
    ...base, ...navyCoat, hair: HAIR.navy, hairStyle: 'curly', hairLen: 28, sideLen: 22, eye: EYE.green, smile: true,
    cape: [R.navy[2], R.navy[2], R.navy[3], R.navy[3], R.navy[4]], capeTrim: R.gold, goldTrim: true, buttons: R.gold,
    held: ['swordHip'], pose: 'cross',
    battle: { weapon: 'sword' },
  },
  oswald: {
    ...base, ...navyCoat, hair: HAIR.black, hairStyle: 'slick', sideGrey: R.ash[0], eye: EYE.grey, brow: 'sharp', moustache: HAIR.black,
    cape: [R.navy[2], R.navy[2], R.navy[3], R.navy[3], R.navy[4]], plate: true, epaulettes: true, belt: CLOTH.slate, held: ['swordBack'],
  },
  aldric: {
    ...base, hair: HAIR.dark, hairStyle: 'long', hairLen: 28, sideLen: 25, eye: EYE.greyblue, crown: true,
    beard: HAIR.dark, beardLen: 1, cloth: CLOTH.red, dress: true, skirtW: 2, royalBand: true, cuff: R.gold, cape: cape(CLOTH.red),
    held: ['staff_scepter'],
  },
  marcion_hooded: {
    ...base, cloth: CLOTH.slate, dress: true, skirtW: 2, hood: CLOTH.slate, hoodShade: true, cape: cape(CLOTH.slate), ragged: true,
    glove: glowGlove, glow: R.sky[2],
    battle: { cast: [R.white[0], R.sky[0], R.sky[1]] },
  },
  marcion: {
    ...base, skin: [R.skin[0], R.skin[1], R.skin[2], R.skin[3], R.skin[4]], eye: EYE.grey, cloth: CLOTH.grey, dress: true, skirtW: 2,
    hood: CLOTH.slate, cape: cape(CLOTH.slate), crossColor: [R.slate[1], R.slate[2]], glove: glowGlove, glow: R.sky[2], armMark: [R.white[0], R.sky[0]],
  },
  ignatius: {
    ...base, hair: HAIR.white, hairStyle: 'long', hairLen: 31, sideLen: 27, eye: EYE.blue, beard: HAIR.white, beardLen: 6, mitre: true,
    cloth: CLOTH.white, dress: true, skirtW: 2, stole: true, cuff: R.gold, hemTrim: R.gold, held: ['staff_gold'], drop: 3,
  },
  herman: {
    ...base, hair: HAIR.grey, hairStyle: 'slick', eye: EYE.grey, smile: true, brow: 'plain',
    cloth: CLOTH.red, coat: 40, fur: true, cuff: R.gold, necklace: 'gold', pants: R.slate, shoes: R.slate,
  },
  cassius: {
    ...base, hair: HAIR.silver, hairStyle: 'long', hairLen: 34, sideLen: 28, eye: EYE.violet, brow: 'plain', beard: HAIR.silver, beardLen: 3,
    circlet: true, cloth: CLOTH.slate, dress: true, skirtW: 2, starRobe: true, star: true, cuff: R.violet, held: ['staff_moon'], drop: 1,
  },
  ursha: {
    ...base, skin: CLOTH.tan, hair: HAIR.white, hairStyle: 'braid', hairLen: 40, ears: true, tail: true, eye: EYE.yellow, brow: 'plain',
    cloth: CLOTH.sand, dress: true, skirtW: 2, outer: CLOTH.wood, necklace: 'beads', glove: CLOTH.tan, held: ['staff_wood'], drop: 3,
  },
  blacksmith: {
    ...base, hair: HAIR.grey, hairStyle: 'short', brow: 'heavy', beard: HAIR.grey, beardLen: 3,
    cloth: CLOTH.ivory, lower: 'tunic', coat: 35, lowerRamp: CLOTH.ivory, apron: CLOTH.wood, pants: CLOTH.brown, shoes: CLOTH.wood,
    held: ['hammer'], drop: 2, wide: 1,
  },
  dwarf_smith: {
    ...base, hair: HAIR.ginger, hairStyle: 'braids', eye: EYE.amber, smile: true, freckles: true, goggles: true,
    cloth: CLOTH.sand, sleeve: R.skin, lower: 'tunic', coat: 35, lowerRamp: CLOTH.wood, apron: CLOTH.wood, apronRunes: true,
    glove: CLOTH.wood, pants: CLOTH.brown, shoes: CLOTH.wood, held: ['runeHammer'], drop: 5, wide: 1,
  },
  dwarf_gatekeeper: {
    ...base, hair: HAIR.brown, hairStyle: 'short', brow: 'heavy', beard: HAIR.brown, beardLen: 6,
    cloth: CLOTH.iron, armor: true, lower: 'tunic', coat: 36, belt: CLOTH.wood, buckle: R.gold, glove: CLOTH.iron, pants: CLOTH.brown, shoes: R.slate,
    held: ['spear'], drop: 5, wide: 1,
  },
  dwarf_kid: { ...base, hair: HAIR.ginger, hairStyle: 'short', smile: true, freckles: true, cloth: CLOTH.green, lower: 'tunic', coat: 34, pants: CLOTH.brown, shoes: CLOTH.wood, drop: 9 },
  dwarf_kid2: { ...base, hair: HAIR.wood, hairStyle: 'curly', sideLen: 17, smile: true, cloth: CLOTH.sky, lower: 'tunic', coat: 34, pants: CLOTH.brown, shoes: CLOTH.wood, drop: 9 },
  dwarf_kid3: { ...base, hair: HAIR.sand, hairStyle: 'short', smile: true, cloth: CLOTH.red, lower: 'tunic', coat: 34, pants: CLOTH.brown, shoes: CLOTH.wood, drop: 9 },

  // ================= 적·모브 =================
  // 근위기사 (프롤로그 근위병과 같은 모습)
  mob_royal_knight: {
    ...base, ...navyCoat, hair: R.hair, hairStyle: 'short', helmet: { plume: [R.sky[0], R.sky[1], R.sky[2]], nose: true },
    cape: [R.navy[2], R.navy[2], R.navy[3], R.navy[3], R.navy[4]], pauldron: 'both', buttons: R.gold, held: ['spear'],
    battle: { lunge: true },
  },
  mob_paladin: {
    ...base, hair: R.hair, hairStyle: 'short', helmet: { plume: [R.gold[0], R.gold[1], R.gold[2]], nose: true },
    cloth: CLOTH.silver, armor: true, lower: 'tunic', coat: 37, tabard: R.white, crossColor: [R.gold[0], R.gold[1]], glove: CLOTH.iron, pants: CLOTH.silver,
    held: ['spear'],
    battle: { lunge: true },
  },
  paladin_captain: {
    ...base, hair: R.hair, hairStyle: 'short', helmet: { plume: [R.gold[0], R.gold[1], R.gold[2]], nose: true },
    cloth: CLOTH.silver, armor: true, lower: 'tunic', coat: 37, tabard: R.white, crossColor: [R.gold[0], R.gold[1]], glove: R.gold, pants: CLOTH.silver,
    pauldron: 'both', pauldronTrim: R.gold, cape: cape(R.white), held: ['spear'],
    battle: { lunge: true },
  },
  mob_gnosis: {
    ...base, cloth: CLOTH.slate, lower: 'tunic', coat: 37, hood: CLOTH.slate, faceCloth: CLOTH.slate, eye: [R.sky[0], R.sky[1], R.sky[2]],
    belt: CLOTH.slate, eyePendant: true, glove: CLOTH.slate, held: ['darkdagger'],
    battle: { weapon: 'darkdagger', prep: true },
  },
  raid_captain: {
    ...base, cloth: CLOTH.slate, dress: true, skirtW: 2, hood: CLOTH.slate, hoodShade: true, mask: true, crossColor: [R.white[0], R.white[1]],
    sleeve: CLOTH.slate, armMark: [R.white[0], R.sky[0]], glove: glowGlove, glow: R.sky[2], drop: 0,
    battle: { cast: [R.white[0], R.white[1], R.white[2]] },
  },
  imperial_spear: {
    ...base, hair: R.hair, hairStyle: 'short', helmet: { plume: [R.red[0], R.red[1], R.red[2]] },
    cloth: CLOTH.red, lower: 'tunic', coat: 37, plate: true, belt: CLOTH.wood, glove: CLOTH.wood, pants: CLOTH.brown, shoes: CLOTH.wood,
    held: ['spear'],
    battle: { lunge: true },
  },
  imperial_archer: {
    ...base, hair: R.hair, hairStyle: 'short', helmet: {},
    cloth: CLOTH.wood, lower: 'tunic', coat: 37, belt: R.red, cuff: R.red, glove: CLOTH.wood, pants: CLOTH.brown, shoes: CLOTH.wood,
    held: ['bow', 'quiver'],
    battle: { lunge: true },
  },
  pursuit_sword: {
    ...base, hair: R.hair, hairStyle: 'short', helmet: { plume: [R.ash[0], R.slate[0], R.slate[1]], nose: true },
    cloth: CLOTH.slate, lower: 'tunic', coat: 37, plate: true, pauldron: 'both', cape: cape(CLOTH.slate), belt: CLOTH.slate, glove: CLOTH.iron,
    held: ['swordHip'],
    battle: { lunge: true },
  },
  pursuit_shield: {
    ...base, hair: R.hair, hairStyle: 'short', helmet: { plume: [R.ash[0], R.slate[0], R.slate[1]], nose: true },
    cloth: CLOTH.slate, lower: 'tunic', coat: 37, plate: true, pauldron: 'both', cape: cape(CLOTH.slate), belt: CLOTH.slate, glove: CLOTH.iron,
    held: ['kiteShield'],
    battle: { lunge: true },
  },
  mob_citizen: {
    ...base, hair: HAIR.wood, hairStyle: 'short', cloth: CLOTH.green, lower: 'tunic', coat: 36, belt: CLOTH.wood, pants: CLOTH.sand, shoes: CLOTH.wood,
    held: ['basket'],
  },
  mob_wolf: {
    ...base, skin: CLOTH.tan, hair: HAIR.grey, hairStyle: 'short', ears: true, tail: true, eye: EYE.yellow, brow: 'heavy',
    cloth: CLOTH.tan, lower: 'tunic', coat: 37, lowerRamp: CLOTH.wood, sash: CLOTH.wood, glove: CLOTH.tan, pants: CLOTH.grey, shoes: CLOTH.wood,
    held: ['spear'],
    battle: { lunge: true },
  },
  wolf_scout: {
    ...base, skin: CLOTH.tan, hair: HAIR.grey, hairStyle: 'short', ears: true, tail: true, eye: EYE.yellow, brow: 'heavy',
    cloth: CLOTH.wood, sleeve: CLOTH.tan, lower: 'tunic', coat: 36, lowerRamp: CLOTH.sand, belt: CLOTH.wood, glove: CLOTH.tan, pants: CLOTH.grey, shoes: CLOTH.wood,
  },
  wolf_scout_tied: { like: 'wolf_scout', ropes: true, pose: 'cross' },
  bandit_blade: {
    ...base, hood: CLOTH.sand, faceCloth: CLOTH.sand, cloth: CLOTH.wood, lower: 'tunic', coat: 37, belt: R.red, glove: CLOTH.wood, pants: CLOTH.brown, shoes: CLOTH.wood,
    held: ['dagger'],
    battle: { weapon: 'dagger', dual: true },
  },
  bandit_archer: {
    ...base, hood: CLOTH.sand, cloth: CLOTH.brown, lower: 'tunic', coat: 37, belt: R.red, glove: CLOTH.wood, pants: CLOTH.brown, shoes: CLOTH.wood,
    held: ['bow', 'quiver'],
    battle: { lunge: true },
  },
  astra_mage: {
    ...base, eye: EYE.violet, hood: CLOTH.white, cloth: CLOTH.white, dress: true, skirtW: 2, belt: CLOTH.violet, cuff: R.violet, hemTrim: R.violet,
    runes: [R.sky[0], R.sky[1]],
    battle: { cast: [R.violet[0], R.violet[1], R.violet[2]] },
  },
  astra_captain: {
    ...base, eye: EYE.yellow, hood: CLOTH.violet, cloth: CLOTH.violet, dress: true, skirtW: 2, belt: R.gold, cuff: R.gold, hemTrim: R.gold,
    runes: [R.sky[0], R.sky[1]],
  },
  astra_binder: {
    ...base, eye: EYE.violet, hood: CLOTH.slate, cloth: CLOTH.slate, dress: true, skirtW: 2, cuff: R.violet, hemTrim: R.violet,
    chains: [R.violet[0], R.violet[1], R.violet[2]],
    battle: { cast: [R.violet[0], R.violet[1], R.violet[3]] },
  },
};
