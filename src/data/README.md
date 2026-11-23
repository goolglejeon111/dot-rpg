# 데이터 파일 작성법

| 파일 | 내용 |
|---|---|
| `characters.json` | 인물 ID, 이름, 표정 목록 |
| `initialState.json` | 새 게임 시작 시 호감도와 플래그 기본값 |
| `dialogue/*.json` | 이야기(대본) 데이터. 파일을 추가하면 자동으로 불러옴 |

## 대사를 고치는 방법

1. **대본에서 고치기 (권장)**: `docs/대본/프롤로그.md`를 고친 뒤 `npm run script` → `dialogue/prologue.json`이 다시 만들어집니다.
   - 장소 이름, 배경색, 전투 자리, 장면 ID는 `tools/script/stories.mjs`에서 정합니다.
2. **데이터에서 바로 고치기**: `dialogue/prologue.json`을 직접 고쳐도 됩니다. 단, 그 뒤에 `npm run script`를 돌리면 대본 내용으로 덮어써집니다.
3. `npm run script:check`: 대본과 데이터가 한 줄도 빠짐없이 같은지 비교합니다.

## 이야기 파일

```json
{
  "id": "prologue", "title": "...",
  "endings": { "prologue_dead": { "type": "dead", "label": "DEAD END", "title": "..." } },
  "chapters": { "act1": { "title": "1막으로 이어집니다" } },
  "scenes": [
    { "id": "scene1", "title": "장면 1. ...", "place": "황궁 회랑", "color": "#141a2a", "nodes": [ ... ] }
  ]
}
```

- 장면은 위에서 아래로 이어집니다. `"branch": true`인 장면은 선택지로만 들어갑니다.
- 장면이 바뀌면 스탠딩은 모두 퇴장하고, 인물은 그 장면에서 처음 말할 때 등장합니다 (레온 왼쪽, 나머지 오른쪽).

### 노드 종류

| 종류 | 예시 |
|---|---|
| 대사 (스탠딩 있음) | `{ "speaker": "bram", "expression": "angry", "text": "..." }` |
| 대사 (이름표만) | `{ "name": "추격 기사", "expression": "angry", "text": "..." }` |
| 독백 (한 화면) | `{ "monologue": ["첫 줄", "둘째 줄"] }` |
| 선택지 | `{ "choices": [ { "text": "...", "next": "장면ID", "flags": { ... } } ] }` |
| 전투 자리 (지금은 건너뜀) | `{ "battle": "하수인들", "note": "여기에 전투가 들어감" }` |
| 장소 이름 바꾸기 | `{ "place": "광장" }` |
| 엔딩 | `{ "ending": "prologue_dead" }` |
| 막 전환 | `{ "chapter": "act1" }` |

- `expression`: normal, smile, angry, sad, surprised
- `position`(선택): left, right — 생략하면 레온 왼쪽, 나머지 오른쪽

## 스탠딩 그림

- 몸: `public/assets/portraits/{인물ID}_body.png` (기본 표정 포함)
- 표정 얼굴: `public/assets/portraits/{인물ID}_face_{표정}.png` (몸과 같은 크기 1024x1344, 투명 PNG)
- 표정이 normal이거나 얼굴 파일이 없으면 몸만, 몸도 없으면 회색 실루엣

### 효과 (대사, 선택지 항목, ending/chapter 노드에 붙일 수 있음)

```json
{ "affection": { "serena": 1, "karg": -1 }, "flags": { "galia_alive": true } }
```

호감도 키: `serena`, `elysia_leon`, `elysia_karg`, `karg`, `adrian`

### 조건 (선택지의 `condition`)

```json
{ "affection": "serena", "op": ">=", "value": 5 }
{ "flag": "galia_alive", "value": true }
{ "all": [조건, 조건] }
{ "any": [조건, 조건] }
```
