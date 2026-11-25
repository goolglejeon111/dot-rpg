import Phaser from 'phaser';
import cgData from '../data/cg.json';
import { loadOptional } from './assets';

/**
 * 이벤트 CG. 목록과 순서는 src/data/cg.json, 그림은 public/assets/cg/{id}.png (4:3).
 * 그림 파일이 없으면 CG 없이 진행한다 (넣기만 하면 코드 수정 없이 나옴)
 */
export const CG_LIST: { id: string; title: string }[] = cgData.cgs;

export const cgKey = (id: string) => `cg_${id}`;

/** 있는 CG 그림만 불러온다 */
export const loadCgs = (scene: Phaser.Scene, ids: string[]) =>
  loadOptional(scene, ids.map((id) => ({ key: cgKey(id), url: `assets/cg/${id}.png` })));
