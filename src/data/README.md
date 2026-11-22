# 데이터 파일 작성법

| 파일 | 내용 |
|---|---|
| `characters.json` | 인물 ID, 이름, 표정 목록 |
| `initialState.json` | 새 게임 시작 시 호감도와 플래그 기본값 |
| `endings.json` | `endings`(배드/데드 등 엔딩 화면), `chapters`(막 전환 화면) |
| `dialogue/*.json` | 장면별 대화. 파일을 추가하면 자동으로 불러옴 |

## 대화 파일

```json
{ "id": "장면ID", "title": "설명", "nodes": [ ... ] }
```

`nodes`는 위에서 아래로 진행합니다. `next`를 쓰면 해당 `id`의 노드로 건너뜁니다.

### 노드 종류

| 종류 | 예시 |
|---|---|
| 대사 | `{ "speaker": "leon", "expression": "smile", "position": "left", "text": "..." }` |
| 나레이션 | `{ "text": "..." }` (speaker 없음) |
| 선택지 | `{ "choices": [ { "text": "...", "next": "노드ID" } ] }` |
| 조건 분기 | `{ "branch": [ { "if": 조건, "next": "노드ID" } ], "else": "노드ID" }` |
| 필드로 복귀 | `{ "end": true }` |
| 엔딩 화면 | `{ "ending": "prologue_dead" }` |
| 막 전환 화면 | `{ "chapter": "act1" }` |
| 다른 대화로 이동 | `{ "goto": "다른장면ID" }` |

- `expression`: normal, smile, angry, sad, surprised
- `position`: left, right

### 효과 (대사, 선택지 항목, end/ending/chapter 노드에 붙일 수 있음)

```json
{ "affection": { "serena": 1, "karg": -1 }, "flags": { "galia_alive": true } }
```

호감도 키: `serena`, `elysia_leon`, `elysia_karg`, `karg`, `adrian`

### 조건 (선택지의 `condition`, 분기의 `if`)

```json
{ "affection": "serena", "op": ">=", "value": 5 }
{ "flag": "galia_alive", "value": true }
{ "all": [조건, 조건] }
{ "any": [조건, 조건] }
```

`op`: `>=`, `<=`, `>`, `<`, `==`, `!=` (생략 시 호감도는 `>=`, 플래그는 `==`)

예: 5막 세레나의 선택

```json
{ "branch": [
    { "if": { "affection": "serena", "op": ">=", "value": 8 }, "next": "serena_high" },
    { "if": { "affection": "serena", "op": ">=", "value": 4 }, "next": "serena_mid" }
  ],
  "else": "serena_low" }
```
