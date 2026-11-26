// 외부 패키지 없이 PNG 읽기 (8비트 RGBA·RGB·팔레트 없는 그림, 인터레이스 없음)
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/** 파일 → { w, h, data: Uint8Array(w*h*4) } */
export function readPNG(file) {
  const b = readFileSync(file);
  let p = 8;
  let w = 0, h = 0, ct = 0, depth = 0;
  const idat = [];
  let plte = null, trns = null;
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    const d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`${file}: 8비트 그림만 읽습니다`);
  const bpp = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const up = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = y > 0 && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const q = a + up - c; const pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ct === 6) data.set(px.subarray(i * 4, i * 4 + 4), i * 4);
    else if (ct === 2) { data.set(px.subarray(i * 3, i * 3 + 3), i * 4); data[i * 4 + 3] = 255; }
    else if (ct === 3) { const k = px[i]; data.set(plte.subarray(k * 3, k * 3 + 3), i * 4); data[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (ct === 0) { data.fill(px[i], i * 4, i * 4 + 3); data[i * 4 + 3] = 255; }
    else if (ct === 4) { data.fill(px[i * 2], i * 4, i * 4 + 3); data[i * 4 + 3] = px[i * 2 + 1]; }
  }
  return { w, h, data };
}
