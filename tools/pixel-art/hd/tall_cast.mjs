// 3등신 조연·적·모브 (파티 밖 모든 인물). 설정은 hd/cast.mjs(PEOPLE)의 값을 그대로 읽어 3등신 몸에 입힌다.
// 머리·머리카락·몸 비율은 파티와 같은 표(hd/tall.mjs)를 쓴다 → 머리카락이 얼굴에 붙고, 몸과 한 덩어리로 움직임
// 2.5등신 설정의 줄 번호(32x48 칸: 머리 3~19, 몸 20~32, 다리 33~45)는 mapY로 3등신 그림 줄(64x96)로 옮김
import { RAMPS } from '../palette.mjs';

const R = RAMPS;
export const mapY = (y) => (y <= 19 ? (y * 31) / 19 : y <= 32 ? 32 + ((y - 20) * 25) / 12 : 57 + ((y - 33) * 34) / 12);

// 얼굴 지도 이름 → 3등신 눈 모양 (엑스트라는 얼굴마다 눈이 달라 옆 사람과 겹치지 않음)
const FACE_EYES = {
  extra_a: 'sharp', extra_b: 'small', extra_c: 'narrow', extra_d: 'round',
  wolf_a: 'sharp', wolf_b: 'narrow', wolf_c: 'small', marcion: 'calm',
};

/** PEOPLE 설정 → 3등신 그림 설정 */
export function castSpec(id, p) {
  const hs = p.hairStyle ?? 'bald';
  const covered = !!(p.hood || p.helmet);
  const hairMap = { short: 'short', slick: 'slick', long: 'long', curly: 'curly', braid: 'slick', braids: 'bob', bald: 'bald' };
  const wide = (p.wide ?? 0) * 2;
  const kid = (p.drop ?? 0) >= 9;
  const build = [
    (kid ? 9.5 : 11.5) + wide + (p.armor ? 1 : 0),
    (kid ? 7.5 : 8.5) + wide,
    (kid ? 8 : 9) + wide,
    (kid ? 2.1 : 2.4) + wide * 0.25,
  ];
  const face = p.face ?? id;
  const eyes = FACE_EYES[face] ?? (p.brow === 'heavy' || p.brow === 'sharp' ? 'sharp' : 'small');
  const s = {
    look: 'cast', generic: true, hair: covered ? 'bald' : hairMap[hs] ?? 'short', build, eyes, brow: p.brow ?? 'plain',
    drop: (p.drop ?? 0) * 2, skirt: !!p.dress, hood: !!p.hood, helmet: p.helmet, ears: !!p.ears, tail: !!p.tail,
    boot: p.armor ? 81 : 85, knee: !!p.armor, thick: (p.wide ?? 0) > 0,
  };
  if (hs === 'long') {
    s.long = Math.round(mapY(p.hairLen ?? 30));
    if (p.sideLen) s.side = Math.round(mapY(p.sideLen));
  }
  if (hs === 'braid') s.braid = Math.round(mapY(p.hairLen ?? 36));
  if (hs === 'braids') s.braids = true;
  if (hs === 'curly' && p.sideLen) s.side = Math.round(mapY(p.sideLen));
  return s;
}

/** 머리 위 쓰개(투구·관·주교관·머리띠·고글)와 얼굴 가리개(복면·가면) */
export function headwear(c, H) {
  const { spans, lock, ell, out, lay, CX, faceHW, capHW, sideAt, roundShade } = H;
  const L = lay();
  const { p, s, oy, v } = c;
  const Y = (n) => n + oy;
  const side = v === 'right';
  const metal = [R.white[0], R.white[1], R.white[2], R.white[3]];
  if (s.helmet) {
    const hm = s.helmet;
    // 둥근 투구: 머리카락 덮개보다 1칸 크게. 테는 이마(13~15줄)
    if (side) {
      spans(L, Y(3), Y(26), (y) => {
        const r = y - oy;
        const ry = (r - 16.8) / 12.6;
        const w = ry > -1 && ry < 1 ? 13 * Math.sqrt(1 - ry * ry) : 0;
        if (!w) return null;
        const back = r < 16.8 ? 30.5 - w : r > 22 ? 22 + (r - 22) : 18;
        const front = r <= 15 ? Math.min(30.5 + w, (sideAt(r)?.[1] ?? 35) + 1.5) : 27 - (r > 22 ? (r - 22) : 0);
        return front > back ? [back + 0.5, front - 0.5] : null;
      }, (x, y, t) => roundShade(metal, t * 2 - 1, (y - oy - 14) / 12));
      if (hm.nose) for (let y = Y(14); y <= Y(23); y++) L.set(41, y, metal[2]);
      spans(L, Y(15), Y(25), () => [32, 35], (x, y, t) => (t > 0.6 ? metal[3] : metal[2])); // 뺨 가리개
    } else {
      spans(L, Y(3), Y(v === 'up' ? 28 : 15), (y) => {
        const r = y - oy;
        const hw = r < 17 ? capHW(r) + 0.8 : 13.2 - (r > 24 ? (r - 24) * 0.6 : 0);
        return hw > 0.5 ? [CX - hw + 0.5, CX + hw - 0.5] : null;
      }, (x, y, t) => roundShade(metal, t * 2 - 1, (y - oy - 14) / 12));
      if (v === 'down') {
        spans(L, Y(13), Y(15), () => [CX - 12.8, CX + 12.8], (x, y) => (y === Y(13) ? metal[1] : metal[3])); // 테
        for (const sd of [-1, 1]) spans(L, Y(15), Y(25), (y) => {
          const f = faceHW(false, y - oy);
          const a = CX + sd * (f - 1.5);
          const b = CX + sd * (f + 1.2);
          return sd < 0 ? [b + 0.5, a + 0.5] : [a - 0.5, b - 0.5];
        }, (x, y, t) => (sd < 0 ? metal[1] : metal[3]));
        if (hm.nose) for (let y = Y(15); y <= Y(23); y++) { L.set(31, y, metal[1]); L.set(32, y, metal[3]); }
      }
    }
    if (hm.plume) {
      // 꼭대기 깃털 장식: 앞뒤로 긴 볏
      const pl = hm.plume;
      if (side) lock(L, 22, 33, Y(3), 17, Y(9), (x, y, t) => (t < 0.4 ? pl[0] : pl[1]));
      else ell(L, CX, Y(3.5), 2.6, 3.8, (x, y, nx, ny) => (nx < -0.2 && ny < 0 ? pl[0] : nx > 0.4 ? pl[2] : pl[1]));
    }
    out(L);
  }
  if (p.crown) {
    const G = R.gold;
    const P = lay();
    spans(P, Y(5), Y(9), () => [CX - 8.5, CX + 8.5], (x, y, t) => (t < 0.2 ? G[0] : t > 0.8 ? G[2] : G[1]));
    if (!side) for (const x of [CX - 7, CX, CX + 7]) lock(P, Math.round(x) - 1, Math.round(x) + 1, Y(5), Math.round(x), Y(1), () => G[1]);
    else for (const x of [25, 32]) lock(P, x - 1, x + 1, Y(5), x, Y(1), () => G[1]);
    out(P);
    if (v === 'down') { P.set(31, Y(7), R.red[1]); P.set(32, Y(7), R.red[1]); }
    L.over(P);
  }
  if (p.mitre) {
    // 주교관: 이마에서 위로 뾰족, 가운데 금줄
    const C = p.cloth ?? R.white;
    const P = lay();
    spans(P, Y(-5), Y(11), (y) => {
      const k = (y - Y(-5)) / 16;
      const hw = 3 + k * 8;
      return side ? [30.5 - hw * 0.9, 30.5 + hw * 0.9] : [CX - hw + 0.5, CX + hw - 0.5];
    }, (x, y, t) => {
      if (y >= Y(9)) return R.gold[1];
      if (!side && Math.abs(x + 0.5 - CX) < 1.2) return R.gold[1];
      return t < 0.2 ? C[0] : t > 0.8 ? C[2] : C[1];
    });
    out(P);
    L.over(P);
  }
  if (p.circlet && v !== 'up') {
    const P = lay();
    if (side) spans(P, Y(10), Y(10), () => [26, 40], () => R.gold[1]);
    else spans(P, Y(10), Y(10), () => [CX - 11, CX + 11], () => R.gold[1]);
    if (v === 'down') { P.set(31, Y(10), R.violet[0]); P.set(32, Y(10), R.violet[0]); P.set(31, Y(11), R.violet[1]); P.set(32, Y(11), R.violet[1]); }
    L.over(P);
  }
  if (p.goggles) {
    const P = lay();
    if (v === 'down') {
      spans(P, Y(9), Y(10), () => [CX - 12.5, CX + 12.5], () => R.wood[3]);
      for (const gx of [CX - 4.5, CX + 4.5]) ell(P, gx, Y(9.5), 3, 2.6, (x, y, nx, ny) => (nx * nx + ny * ny < 0.4 ? (nx < 0 && ny < 0 ? R.sky[0] : R.sky[1]) : R.wood[2]));
    } else if (side) {
      spans(P, Y(9), Y(10), () => [19, 40], () => R.wood[3]);
      ell(P, 37, Y(9.5), 2.6, 2.6, (x, y, nx, ny) => (nx * nx + ny * ny < 0.4 ? R.sky[0] : R.wood[2]));
    } else spans(P, Y(9), Y(10), () => [CX - 12.5, CX + 12.5], () => R.wood[3]);
    out(P);
    L.over(P);
  }
  if (p.faceCloth && v !== 'up') {
    // 코 아래를 가린 천
    const F = p.faceCloth;
    const P = lay();
    if (side) spans(P, Y(24), Y(33), (y) => { const f = sideAt(Math.min(31, y - oy)); return [30, (f?.[1] ?? 36) + 0.6]; }, (x, y, t) => (t > 0.7 ? F[2] : F[1]));
    else spans(P, Y(24), Y(33), (y) => { const hw = Math.max(faceHW(false, Math.min(31, y - oy)), 5) + 0.6; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => (y === Y(24) ? F[0] : t > 0.8 ? F[2] : F[1]));
    out(P);
    L.over(P);
  }
  if (p.mask && v !== 'up') {
    // 흰 가면 (눈 구멍만)
    const Mk = [R.white[0], R.white[1], R.white[2]];
    const P = lay();
    if (side) spans(P, Y(13), Y(27), (y) => [33, (sideAt(y - oy)?.[1] ?? 40) + 0.4], (x, y, t) => (y >= Y(19) && y <= Y(20) && x >= 36 && x <= 39 ? R.slate[3] : t > 0.7 ? Mk[2] : Mk[1]));
    else spans(P, Y(13), Y(27), (y) => { const hw = faceHW(false, y - oy) - 0.5; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => {
      if (y >= Y(19) && y <= Y(20) && ((x >= 24 && x <= 28) || (x >= 35 && x <= 39))) return R.slate[3];
      return t < 0.2 ? Mk[0] : t > 0.8 ? Mk[2] : Mk[1];
    });
    out(P);
    L.over(P);
  }
  return L;
}

/** 수염·콧수염 (얼굴 위) */
export function beard(c, L, H) {
  const { spans, CX, faceHW, sideAt } = H;
  const { p, oy, v } = c;
  if (v === 'up') return;
  const Y = (n) => n + oy;
  if (p.beard) {
    const b = p.beard;
    const len = (p.beardLen ?? 2) * 2.4;
    const top = (p.beardLen ?? 2) <= 1 ? 28 : 24;
    const col = (x, y, t) => (t < 0.25 ? b[1] : t > 0.75 ? b[3] : b[2]);
    if (v === 'right') {
      spans(L, Y(top), Y(31 + len), (y) => {
        const r = y - oy;
        const f = sideAt(Math.min(31, r));
        const front = r <= 31 ? f[1] + 0.5 : 35 - (r - 31) * (3 / Math.max(1, len));
        const back = r <= 31 ? Math.max(f[0] + 6, 28) : 29 + (r - 31) * 0.5;
        if (r === 27 || r === 26) return [back, Math.min(front, 37)];
        return front > back ? [back + 0.5, front - 0.5] : null;
      }, col);
    } else {
      spans(L, Y(top), Y(31 + len), (y) => {
        const r = y - oy;
        const hw = r <= 31 ? faceHW(false, r) + 0.4 : Math.max(1, 3.5 * (1 - (r - 31) / Math.max(1, len)) + 1);
        return [CX - hw + 0.5, CX + hw - 0.5];
      }, (x, y, t) => {
        const r = y - oy;
        if (r >= 26 && r <= 27 && x >= 29 && x <= 34) return r === 27 ? c.p.skin[3] : null; // 입
        if (r < 26 && x > 25 && x < 38) return null; // 볼은 비움
        return col(x, y, t);
      });
    }
  }
  if (p.moustache) {
    const m = p.moustache;
    if (v === 'right') for (const x of [37, 38, 39, 40]) L.set(x, Y(26), m[2]);
    else for (const x of [27, 28, 29, 30, 33, 34, 35, 36]) L.set(x, Y(26) - (x === 27 || x === 36 ? 0 : 0), m[x < 31 ? 1 : 2]);
  }
}

/** 옷·든 물건 → { back, body, front } */
export function outfitGeneric(c, H) {
  const { spans, limb, lock, ell, stamp, band, out, lay, CX, FOOT_T, torso, skirtL, collar, pauldron, arm, capeBack, hoodFront, drawTail } = H;
  const { p, s, oy, v } = c;
  const Y = (n) => n + oy;
  const side = v === 'right';
  const back = [];
  const body = [];
  const front = [];
  const C = p.cloth ?? R.white;
  const [shw, waist, hip, ar] = s.build;
  const ax = shw - 0.7;
  const swing = c.swing ?? 0;
  const shoulderX = (sd) => CX + sd * (ax + 0.3);
  const clothCol = (x, y, t) => (side ? (t > 0.72 ? C[2] : C[1]) : t < 0.14 ? C[0] : t > 0.84 ? C[2] : C[1]);
  const armorCol = (x, y, t) => (side ? (t > 0.7 ? C[3] : t > 0.4 ? C[2] : C[1]) : t < 0.12 ? C[0] : t < 0.35 ? C[1] : t > 0.8 ? C[3] : C[2]);
  const outerCol = (x, y, t) => (p.outer && !side && (t < 0.26 || t > 0.74) ? (t < 0.1 ? p.outer[0] : p.outer[1]) : null);
  const bodyCol = (x, y, t, r) => outerCol(x, y, t) ?? (p.armor ? armorCol(x, y, t) : clothCol(x, y, t));
  const sleeve = p.sleeve ? [p.sleeve[0], p.sleeve[1], p.sleeve[2]] : p.outer ? [p.outer[0], p.outer[1], p.outer[2]] : p.armor ? [C[1], C[2], C[3]] : [C[0], C[1], C[2]];
  const g = p.glove ?? p.skin;
  const hand = [g[0], g[1], g[2]];
  const cuff = p.cuff ? [p.cuff[0], p.cuff[1], p.cuff[2] ?? p.cuff[1]] : null;
  const hem = p.coat ? Math.round(mapY(p.coat)) : null;
  const held = (L, kind) => { L.isHeld = kind; return L; };

  // ---- 망토 ----
  if (p.cape) {
    const cp = p.cape;
    const L = capeBack(c, [cp[1], cp[2], cp[3], cp[4] ?? cp[3]], p.dress ? 86 : 82, p.dress ? 5 : 4);
    if (p.capeTrim && !side) for (let y = 0; y < 96; y++) { const row = L.d[y]; const xs = row.map((q, i) => (q ? i : -1)).filter((i) => i >= 0); if (xs.length > 4) { L.set(xs[1], y, p.capeTrim[1]); L.set(xs[xs.length - 2], y, p.capeTrim[1]); } }
    back.push(L);
  }
  if (s.tail) back.push(drawTail(c));

  // ---- 아랫도리: 긴 옷(dress) / 튜닉 자락 ----
  if (p.dress) {
    const w1 = hip + 3 + (p.skirtW ?? 0) * 1.2;
    const L = skirtL(c, 50, FOOT_T - 2, waist + 0.5, w1, (x, y, t, r) => {
      if (p.hemTrim && y >= FOOT_T - 5) return y === FOOT_T - 5 ? p.hemTrim[0] : p.hemTrim[1];
      if (p.trim && y >= FOOT_T - 5) return p.trim[1];
      const o = outerCol(x, y, t);
      if (o) return o;
      if (p.royalBand && v === 'down' && Math.abs(x + 0.5 - CX) < 1.6) return R.gold[1];
      if (p.starRobe && !side && (x * 7 + r * 13) % 31 === 0) return R.gold[0];
      if (!side && r > 60 && Math.round(x - CX) % 5 === 0) return C[2];
      return clothCol(x, y, t);
    });
    body.push(out(L));
  } else if (hem) {
    const LR = p.lowerRamp ?? C;
    const L = skirtL(c, 52, hem + oy, hip, hip + 2.5, (x, y, t) => {
      if ((p.hemTrim || p.trim) && y >= hem + oy - 1) return (p.hemTrim ?? p.trim)[1];
      if (p.armor && !p.lowerRamp) return armorCol(x, y, t);
      return side ? (t > 0.7 ? LR[2] : LR[1]) : t < 0.14 ? LR[0] : t > 0.84 ? LR[2] : LR[1];
    }, v === 'down' && !p.tabard && !p.apron ? [1, 2.5] : null);
    body.push(out(L));
  }

  // ---- 몸통 ----
  const T = out(torso(c, bodyCol));
  if (v === 'down') {
    if (p.plate) spans(T, Y(35), Y(48), (y) => { const r = y - oy; const hw = shw - 2.5 - (r > 44 ? (r - 44) * 0.8 : 0); return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => (t < 0.18 && y < Y(41) ? R.white[0] : t > 0.8 ? R.white[3] : t < 0.4 ? R.white[1] : R.white[2]));
    if (p.buttons && !p.plate) for (const y of [38, 42, 46]) for (const x of [28, 35]) T.set(x, Y(y), p.buttons[1]);
    if (p.runes) stamp(T, 28, Y(38), ['..s..', '.sSs.', 'sS.Ss', '.sSs.', '..s..'], { s: p.runes[1], S: p.runes[0] });
    if (p.eyePendant) { ell(T, CX, Y(41), 2.2, 1.4, (x, y, nx) => (Math.abs(nx) < 0.4 ? R.sky[0] : R.violet[1])); }
    if (p.royalBand) for (let y = Y(34); y <= Y(57); y++) { T.set(31, y, R.gold[1]); T.set(32, y, R.gold[2]); }
    if (p.sash) {
      limb(T, CX + shw - 2, Y(35), CX - waist + 1, Y(50), 1.6, 1.6, (s2) => (s2 < 0 ? p.sash[0] : p.sash[1]));
    }
    if (p.belt) band(T, Y(50), Y(52), (x, y) => (y === Y(50) ? p.belt[0] : p.belt[1]));
    if (p.buckle) T.rect(30, Y(50), 33, Y(52), (x, y) => (y === Y(50) ? p.buckle[0] : p.buckle[1]));
    if (p.crossColor && !p.tabard) {
      T.rect(30, Y(36), 33, Y(48), (x) => (x < 32 ? p.crossColor[0] : p.crossColor[1]));
      T.rect(26, Y(39), 37, Y(41), (x, y) => (y === Y(39) ? p.crossColor[0] : p.crossColor[1]));
    }
  } else if (side) {
    if (p.belt) band(T, Y(50), Y(52), () => p.belt[1]);
    if (p.buttons && !p.plate) for (const y of [38, 42, 46]) T.set(36, Y(y), p.buttons[1]);
    if (p.plate) spans(T, Y(35), Y(47), () => [32, 37], (x, y, t) => (t < 0.4 ? R.white[1] : R.white[2]));
  } else if (p.belt) band(T, Y(50), Y(52), () => p.belt[2] ?? p.belt[1]);
  body.push(T);

  // 겉에 걸친 것 (앞치마·외투 자락·영대·사제복 띠)
  if (p.tabard && v !== 'up') {
    const tb = lay();
    const bot = (hem ?? 70) + oy;
    if (side) spans(tb, Y(36), bot, () => [34, 38], (x, y, t) => (t > 0.6 ? p.tabard[2] : p.tabard[1]));
    else {
      spans(tb, Y(36), bot, () => [CX - 5.5, CX + 5.5], (x, y, t) => (t < 0.2 ? p.tabard[0] : t > 0.8 ? p.tabard[2] : p.tabard[1]));
      if (p.crossColor) {
        tb.rect(30, Y(39), 33, Y(52), (x) => (x < 32 ? p.crossColor[0] : p.crossColor[1]));
        tb.rect(27, Y(43), 36, Y(45), (x, y) => (y === Y(43) ? p.crossColor[0] : p.crossColor[1]));
      }
    }
    body.push(out(tb));
  }
  if (p.apron && v !== 'up') {
    const A = p.apron;
    const ap = lay();
    const bot = Math.max((hem ?? 66) + oy - 1, Y(62));
    if (side) spans(ap, Y(42), bot, () => [34, 39], (x, y, t) => (t > 0.6 ? A[2] : A[1]));
    else {
      spans(ap, Y(40), bot, (y) => { const hw = y < Y(46) ? 5 : 7; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => (t < 0.18 ? A[0] : t > 0.82 ? A[2] : A[1]));
      if (p.apronRunes) for (const [x, y] of [[29, 54], [31, 56], [33, 54], [35, 56]]) ap.set(x, Y(y), R.sky[0]);
    }
    body.push(out(ap));
  }
  if (p.stole && v === 'down') {
    const st = lay();
    for (const x0 of [26, 36]) st.rect(x0, Y(33), x0 + 1, Y(76), (x) => (x === x0 ? R.gold[0] : R.gold[1]));
    for (const x0 of [26, 36]) st.rect(x0, Y(74), x0 + 1, Y(76), R.red[1]);
    front.push(out(st));
  }
  if (p.chains && v !== 'up') {
    const ch = lay();
    const pts = side ? [[[28, 36], [36, 60]]] : [[[CX - shw + 2, 36], [CX + waist, 62]], [[CX + shw - 2, 36], [CX - waist, 62]]];
    for (const [[x0, y0], [x1, y1]] of pts) {
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 3);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        ell(ch, x0 + (x1 - x0) * k, Y(y0 + (y1 - y0) * k), 1.4, 1.2, (x, y, nx, ny) => (nx * nx + ny * ny < 0.3 ? null : i % 2 ? p.chains[1] : p.chains[0]));
      }
    }
    front.push(out(ch));
  }

  // ---- 깃·목 장식 ----
  if (p.collar) front.push(collar(c, 27, 33, v === 'up' ? 7 : 6, (x, y, t, r) => (v === 'down' && r < 29 && Math.abs(x + 0.5 - CX) < 4 ? null : t < 0.3 ? C[0] : C[2])));
  if (p.fur && v !== 'up') {
    const fu = lay();
    const F = [R.ivory[0], R.ivory[1], R.ivory[2]];
    if (side) spans(fu, Y(29), Y(36), () => [25, 37], (x, y, t) => (y === Y(36) && x % 2 ? null : t > 0.7 ? F[2] : F[1]));
    else spans(fu, Y(29), Y(37), (y) => { const hw = 7 + (y - Y(29)) * 0.8; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => (y === Y(37) && x % 2 ? null : t < 0.2 ? F[0] : t > 0.8 ? F[2] : F[1]));
    front.push(out(fu));
  }
  if (p.scarf) {
    const sc = lay();
    const G = p.scarf;
    if (side) spans(sc, Y(29), Y(36), (y) => [25, 35 - (y < Y(31) ? 3 : 0)], (x, y, t) => (t > 0.7 ? G[2] : G[1]));
    else spans(sc, Y(30), Y(36), (y) => { const r = y - oy; const hw = r < 33 ? 5.5 + (r - 30) * 0.9 : 8.2 - (r - 33) * 0.5; return [CX - hw + 0.5, CX + hw - 0.5]; }, (x, y, t) => (t < 0.25 ? G[0] : t > 0.75 ? G[2] : G[1]));
    front.push(out(sc));
  }
  if (p.necklace && v === 'down') {
    const nk = lay();
    const pts = [[25, 37], [27, 38], [29, 39], [31, 40], [32, 40], [34, 39], [36, 38], [38, 37]];
    pts.forEach(([x, y], i) => {
      const col = p.necklace === 'teeth' ? R.white[0] : p.necklace === 'gold' ? R.gold[i % 2] : [R.red[1], R.sky[1], R.gold[1]][i % 3];
      nk.set(x, Y(y), col);
      if (p.necklace === 'teeth') nk.set(x, Y(y + 1), R.white[1]);
    });
    front.push(nk);
  }

  // ---- 팔 ----
  const hang = (skip = 0) => {
    const res = [];
    if (side) res.push(arm(31, Y(36), 31 + swing * 1.5, Y(45), 32 + swing * 3.5, Y(53), sleeve, hand, ar, cuff));
    else for (const sd of [-1, 1]) {
      if (skip === sd) continue;
      const sw = sd * swing * (v === 'up' ? -1 : 1);
      const x0 = CX + sd * ax;
      res.push(arm(x0, Y(36), x0 + sd * 1.6, Y(45), x0 + sd * 1.3, Y(53) + sw * 0.5, sleeve, hand, ar, cuff));
    }
    return res;
  };
  let arms;
  if (p.ropes && v !== 'up') {
    // 묶인 손: 두 손을 앞으로 모음
    arms = side ? [arm(31, Y(37), 32, Y(45), 36, Y(50), sleeve, hand, ar)]
      : [arm(CX - ax, Y(37), CX - ax - 0.5, Y(45), CX - 2.5, Y(50), sleeve, hand, ar), arm(CX + ax, Y(37), CX + ax + 0.5, Y(45), CX + 2.5, Y(50), sleeve, hand, ar)];
  } else if (p.pose === 'hips' && v === 'down') {
    const x0 = CX - ax;
    arms = [arm(x0, Y(36), x0 - 4.5, Y(45), CX - waist - 0.5, Y(50), sleeve, hand, ar), ...hang(-1)];
  } else arms = hang();
  if (p.bracer || p.armMark) for (const a of arms) for (let y = Y(46); y <= Y(50); y++) for (let x = 0; x < 64; x++) {
    const q = a.getHi(x, y);
    if (!q || hand.includes(q)) continue;
    if (p.armMark && y <= Y(47)) a.set(x, y, p.armMark[y === Y(46) ? 0 : 1]);
    else if (p.bracer) a.set(x, y, p.bracer[y === Y(46) ? 0 : 1]);
  }
  front.push(...arms);
  if (p.ropes && v !== 'up') {
    const rp = lay();
    for (const y of [44, 49]) spans(rp, Y(y), Y(y), () => (side ? [27, 39] : [CX - shw - 1, CX + shw + 1]), (x) => (x % 3 ? R.wood[1] : R.wood[2]));
    front.push(rp);
  }
  // 어깨
  const pr = p.pauldronRamp;
  const pCol = (nx, ny) => {
    if (p.pauldronTrim && ny > 0.45) return p.pauldronTrim[1];
    if (pr) return ny < -0.3 && nx < 0 ? pr[0] : pr[1];
    return ny < -0.35 && nx < 0.2 ? R.white[0] : nx < -0.2 ? R.white[1] : nx > 0.45 || ny > 0.5 ? R.white[3] : R.white[2];
  };
  if (p.pauldron && !side) {
    const sides = p.pauldron === 'both' ? [-1, 1] : [v === 'down' ? -1 : 1];
    for (const sd of sides) front.push(pauldron(shoulderX(sd), Y(35), 4.6, 3.8, (x, y, nx, ny) => pCol(nx, ny)));
  } else if (p.pauldron && side) front.push(pauldron(31, Y(35), 4.4, 3.6, (x, y, nx, ny) => pCol(nx, ny)));
  if (p.epaulettes && !side) for (const sd of [-1, 1]) {
    const ep = pauldron(shoulderX(sd), Y(34.5), 3.6, 2.2, () => R.gold[1]);
    for (let k = -3; k <= 3; k += 2) ep.set(Math.round(shoulderX(sd) + k), Y(37), R.gold[2]);
    front.push(ep);
  }
  if (p.hood) {
    const hd = hoodFront(c, [p.hood[0], p.hood[1], p.hood[2]], !!p.hoodShade);
    hd.isHood = true;
    front.push(hd);
  }
  // 땋은 머리 (드워프 대장장이: 양 갈래가 어깨 앞으로)
  if (s.braids && v !== 'up') {
    const bd = lay();
    const h = p.hair;
    for (const bx of side ? [33] : [CX - 11, CX + 11]) for (let y = Y(26); y <= Y(46); y++) {
      const k = Math.floor((y - Y(26)) / 3) % 2;
      bd.set(Math.round(bx) + k - 1, y, h[1]);
      bd.set(Math.round(bx) + k, y, h[2]);
      bd.set(Math.round(bx) + k + 1, y, h[2]);
    }
    out(bd);
    front.push(bd);
  }

  // ---- 든 물건 ----
  const rh = side ? [32 + swing * 3.5, Y(55)] : v === 'up' ? [CX + shw + 0.6, Y(55)] : [CX - shw - 0.6, Y(55)];
  const lh = side ? [32, Y(55)] : v === 'up' ? [CX - shw - 0.6, Y(55)] : [CX + shw + 0.6, Y(55)];
  for (const kind of p.held ?? []) {
    const L = lay();
    if (kind === 'spear' || kind.startsWith('staff')) {
      const ramp = { spear: R.wood, staff_wood: R.wood, staff_gold: R.gold, staff_moon: R.slate, staff_scepter: R.gold }[kind] ?? R.wood;
      const x = Math.round(side ? 34 : rh[0]);
      const top = kind === 'spear' ? Y(2) : Y(16);
      for (let y = kind === 'spear' ? Y(12) : top; y <= FOOT_T - 2; y++) { L.set(x, y, ramp[1]); L.set(x + 1, y, ramp[2]); }
      if (kind === 'spear') {
        lock(L, x - 1, x + 2, Y(12), x, Y(2), (xx, yy, t) => (t < 0.5 ? R.white[0] : R.white[2]));
        L.set(x - 1, Y(13), R.red[1]); L.set(x + 2, Y(13), R.red[1]); L.set(x - 1, Y(14), R.red[1]); L.set(x + 2, Y(14), R.red[1]);
      } else if (kind === 'staff_gold') {
        L.rect(x - 4, top - 6, x + 5, top - 5, R.gold[1]);
        L.rect(x, top - 11, x + 1, top, R.gold[1]);
      } else if (kind === 'staff_wood') {
        lock(L, x - 4, x + 1, top, x - 5, top - 4, () => R.wood[1]);
        L.rect(x + 3, top + 3, x + 3, top + 9, R.ivory[1]);
      } else if (kind === 'staff_moon') {
        for (const [dx, dy] of [[-4, -9], [-4, -8], [-4, -7], [-3, -10], [-3, -6], [-2, -11], [-2, -5], [-1, -12], [-1, -4], [0, -12], [1, -12], [2, -11]]) L.set(x + dx, top + dy, R.gold[1]);
        L.set(x + 3, top - 8, R.white[0]);
      } else if (kind === 'staff_scepter') {
        ell(L, x + 0.5, top - 4, 3.2, 3.2, (xx, yy, nx, ny) => (nx < 0 && ny < 0 ? R.red[0] : R.red[1]));
        L.rect(x - 2, top - 1, x + 3, top, R.gold[1]);
      }
      out(L);
      if (side) back.push(held(L, kind));
      else body.push(held(L, kind));
    } else if (kind === 'shield' || kind === 'kiteShield') {
      const kite = kind === 'kiteShield';
      const face = kite ? [R.ash[0], R.slate[0], R.slate[1]] : [R.white[0], R.white[1], R.white[2]];
      const rim = kite ? R.white[2] : R.navy[1];
      const x0 = side ? 33 : v === 'up' ? Math.round(CX - shw - 12) : Math.round(CX + shw - 1);
      const x1 = x0 + (side ? 9 : 13);
      spans(L, Y(42), Y(80), (y) => { const k = (y - Y(42)) / 38; return k < 0.6 ? [x0, x1] : [x0 + (k - 0.6) * 11, x1 - (k - 0.6) * 11]; },
        (x, y, t) => (v === 'up' ? (t > 0.7 ? R.wood[2] : R.wood[1]) : t < 0.14 || t > 0.86 || y < Y(44) ? rim : t > 0.6 ? face[2] : face[1]));
      out(L);
      if (v === 'down') {
        const mx = Math.round((x0 + x1) / 2);
        if (kite) { L.rect(mx, Y(48), mx + 1, Y(70), R.white[1]); L.rect(mx - 4, Y(54), mx + 5, Y(55), R.white[1]); }
        else ell(L, mx + 0.5, Y(56), 2.3, 2.3, (xx, yy, nx, ny) => (nx < 0 && ny < 0 ? R.gold[0] : R.gold[1]));
      }
      front.push(held(L, kind));
    } else if (kind === 'swordHip') {
      const [a, b] = side ? [[29, 50], [21, 70]] : v === 'up' ? [[CX - waist + 1, 50], [CX - waist - 5, 72]] : [[CX + waist - 1, 50], [CX + waist + 5, 72]];
      limb(L, a[0], Y(a[1]), b[0], Y(b[1]), 1.3, 1.3, (s2) => (s2 < 0 ? R.slate[0] : R.slate[1]));
      out(L);
      const hx = a[0] - (b[0] - a[0]) * 0.2;
      limb(L, hx, Y(a[1] - 4), a[0], Y(a[1]), 1, 1, () => R.gold[1]);
      (side ? back : front).push(held(L, kind));
    } else if (kind === 'swordBack') {
      const sx = v === 'down' ? 1 : -1;
      if (side) limb(L, 22, Y(10), 25, Y(76), 1.3, 1.6, (s2, t) => (t < 0.2 ? R.wood[2] : s2 < 0 ? R.slate[0] : R.slate[1]));
      else limb(L, CX - sx * 14, Y(10), CX + sx * 11, Y(76), 1.3, 1.6, (s2, t) => (t < 0.2 ? R.wood[2] : s2 < 0 ? R.slate[0] : R.slate[1]));
      out(L);
      (v === 'up' ? front : back).push(held(L, kind));
    } else if (kind === 'bow') {
      const x = side ? 24 : Math.round(lh[0] + (v === 'up' ? -1 : 1));
      const dir = side ? -1 : v === 'up' ? -1 : 1;
      for (let y = Y(34); y <= Y(80); y++) {
        const k = (y - Y(34)) / 46;
        const bx = x + dir * Math.round(5 * Math.sin(Math.PI * k));
        L.set(bx, y, k < 0.5 ? R.wood[1] : R.wood[2]);
        L.set(bx + dir, y, R.wood[2]);
      }
      out(L);
      for (let y = Y(35); y <= Y(79); y++) L.set(x, y, R.sand[0]);
      (side ? back : front).push(held(L, kind));
    } else if (kind === 'quiver') {
      const x = side ? 19 : v === 'up' ? Math.round(CX - 8) : Math.round(CX + 3);
      L.rect(x, Y(36), x + 5, Y(60), (xx) => (xx === x ? R.wood[0] : R.wood[1]));
      for (const xx of [x + 1, x + 3]) { L.rect(xx, Y(29), xx + 1, Y(35), R.white[1]); L.set(xx, Y(29), R.red[1]); }
      out(L);
      (v === 'up' ? front : back).push(held(L, kind));
    } else if (kind === 'basket') {
      const [x, y] = rh;
      L.rect(Math.round(x - 6), Math.round(y + 1), Math.round(x + 5), Math.round(y + 9), (xx, yy) => ((xx + yy) % 2 ? R.wood[1] : R.wood[0]));
      L.rect(Math.round(x - 4), Math.round(y + 1), Math.round(x + 3), Math.round(y + 2), R.white[1]);
      out(L);
      front.push(held(L, kind));
    } else if (kind === 'hammer' || kind === 'runeHammer') {
      const [x, y] = rh;
      const X = Math.round(x);
      L.rect(X, Math.round(y), X + 1, Math.round(y + 12), (xx) => (xx === X ? R.wood[1] : R.wood[2]));
      L.rect(X - 5, Math.round(y + 12), X + 6, Math.round(y + 18), (xx, yy) => (yy === Math.round(y + 12) ? R.ash[0] : R.ash[1]));
      out(L);
      if (kind === 'runeHammer') for (const xx of [X - 3, X, X + 3]) L.set(xx, Math.round(y + 15), R.sky[0]);
      front.push(held(L, kind));
    } else if (kind === 'dagger' || kind === 'darkdagger') {
      const [x, y] = rh;
      const X = Math.round(x);
      const b = kind === 'dagger' ? R.white : R.violet;
      L.rect(X, Math.round(y + 4), X, Math.round(y + 13), b[0]);
      L.rect(X + 1, Math.round(y + 4), X + 1, Math.round(y + 12), b[2]);
      L.rect(X - 2, Math.round(y + 3), X + 3, Math.round(y + 3), R.wood[2]);
      out(L);
      front.push(held(L, kind));
    }
  }
  return { back, body, front };
}
