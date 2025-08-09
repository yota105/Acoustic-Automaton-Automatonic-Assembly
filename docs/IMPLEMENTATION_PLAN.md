## 進捗ログ

### 2025-08-10 Step1: Trackラップ & audioAPI導入
- `src/audio/tracks.ts` 新規作成、Track型・createTrackEnvironment・listTracks実装
- `src/controller.ts` でinitAudio完了時にTrack生成、window.audioAPI.listTracks()導入
- 既存window.faustNode互換維持、UI/param操作は従来通り動作
- 気づき: Track導入後も既存UI壊さず段階移行可能。今後はMicTrackやParamRegistry拡張へ


# 実装方針ロードマップ (Draft)

> **注意**
> このソフトウェアは「まず自分の作品（ライブエレクトロニクス等）を作る」→「後でテンプレートや配布用に“空”の状態にする」ことを前提としています。
> そのため、**作品固有のロジックやUIは必ず「モジュール」や「設定ファイル」として分離**し、テンプレート化時に簡単に除外・切り替えできるようにしてください。
> 今後AIが自動実装する際も、この方針に従い「作品用」と「汎用部」を明確に分けて実装します。



## 目的
単一 `window.faustNode` / 手続き的 UI から、複数トラック・複数DSP・拡張可能なタイムライン/ルーティング/保存機構へ漸進的に移行する。

また、Faust以外のロジック（例：コントローラー入力や独自のインタラクション、MIDI・ゲームパッド・Web API連携など）も、同じ仕組みの中で自然に拡張・統合できることを目指します。
さらに、**立体音響や複数マイキング、複数出力（例：マルチスピーカー/マルチマイク）**など、入出力が独立した複数トラックになるケースにも柔軟に対応できるよう、エンジンON後に各入出力をMicrophone Routing UIから自由にアサイン・テストできる仕組みを早期に導入します。
作品用のTrack/Param/ルーティング/外部連携などは「分離したファイル・モジュール・設定」として管理し、テンプレート化時に容易に“空”にできる設計を徹底します。

---

## 全体アーキテクチャ層



## 進捗記録・運用方針

今後この `IMPLEMENTATION_PLAN.md` に沿って作業を進める際は、どこまで進んだか・どのような実装/修正を行ったか・次にやるべきこと等を必ず記録・追記してください。

### 推奨運用
- 本ファイル内に「進捗ログ」セクションを新設し、日付・内容・担当・次アクション等を時系列で追記する
  - 例: `## 進捗ログ` の下に日付ごとに記録
- もしくは `PROGRESS_LOG.md` など別ファイルを作成し、そちらに進捗をまとめる

どちらの場合も、
  - 日付
  - 実施内容（どのステップ・どのファイルをどう変更したか）
  - 気づき・課題・TODO
  - 次のアクション
を簡潔に残すことを推奨します。

これにより、後から見返した際に進捗や設計意図が分かりやすくなります。
2. Track Layer: Track + DSPChain 管理（`audio/tracks.ts`）
3. Source Layer: Mic / FaustSynth / Sample 生成ファクトリ（`audio/sources/*`）
4. DSP Layer: Faustロード抽象（`audio/dsp/faustLoader.ts`）
5. Routing Layer: Source→Bus 接続（初期は Master固定 → `audio/routing/routingMatrix.ts`）
6. Param Registry: DSPパラメータ列挙・設定API（`audio/params/paramRegistry.ts`）
7. Transport / Scheduler（必要段階で導入）: 再生位置・Clip/Automationスケジュール（`audio/transport/transport.ts`）
8. Persistence: ProjectState JSON dump/load（`audio/project/state.ts`）
9. Event Bus: UI同期の pub/sub（薄い `EventTarget`）

---

## ディレクトリ案
```
src/audio/
  audioCore.ts
  tracks.ts
  routing/routingMatrix.ts
  dsp/faustLoader.ts
  sources/micSource.ts
  sources/faustSource.ts
  sources/sampleSource.ts
  params/paramRegistry.ts
  transport/transport.ts (後)
  project/state.ts (後)
```

---


## コア抽象（最小形）
```ts
// TrackKindは今後も拡張可能（例: 'controller', 'midi', 'custom' など）
type TrackKind = 'mic' | 'faust' | 'sample' | 'bus' | 'controller' | 'midi' | 'custom';

interface DSPUnit {
  id: string;
  node: AudioNode;
  getParamJSON?(): Promise<any>;
  setParam?(addr:string,v:number): void;
}

interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  inputNode: AudioNode;
  volumeGain: GainNode;
  outputNode: AudioNode; // = volumeGain
  dspChain: DSPUnit[];
  muted: boolean;
  solo: boolean;
  // 必要に応じて外部入力やコントローラーとの紐付け情報も追加可能
}

interface RoutingAssignment { sourceId: string; busId: string; gain: number; enabled: boolean; }
```

### Faust以外のロジックや外部インタラクションの拡張例
- TrackKindに'controller'や'midi'などを追加し、コントローラー入力やMIDIイベントをトラックやパラメータに反映できる
- ParamRegistryやEventBusを通じて、外部イベントから任意のパラメータやトラックを操作できる
- 例: コントローラーのノブ操作で特定Trackのパラメータを動かす、MIDIノートでSampleTrackをトリガする など

---

## UI 分割方針
| モジュール | 役割 |
| --- | --- |
| `bootstrap.ts` | DOMContentLoaded → 初期化呼び出し |
| `ui/trackList.ts` | Track列表示・追加・mute/solo/volume |
| `ui/paramPanel.ts` | Track選択 + DSP選択 + Param生成 |
| `ui/micPanel.ts` | 現 mic routing UI を段階移行 |
| `ui/transportBar.ts` | 再生/停止/位置/ループ (後) |
| `ui/visualizerControls.ts` | ウィンドウ操作分離 |
| `ui/projectMenu.ts` | Save/Load |

暫定 `window.audioAPI` に統一アクセスポイント:
```ts
window.audioAPI = {
  listTracks, createFaustTrack, createMicTrack,
  getTrackParams, setParam, attachFaust, saveProject, loadProject
};
```

---



## 段階的導入ステップ

---
#### 【2025-08-10 追記】マイク未接続時のMicTrack有効化予約・仮想トラックについて

現状のStep2では「物理マイクが未接続の場合はMicTrackも生成されない」設計が基本です。
「マイクが未接続でもMicTrackを仮想的に作成し、後から物理マイクが繋がったら自動で有効化」や、
「UI上でMicTrackの有効化を“予約”できる」仕組みは、Step3（複数入出力トラックのアサインUI・入出力テスト機能の導入）や、
さらに後の拡張で扱うことを想定しています。

もしStep2の段階で“仮想MicTrack”や“有効化予約”も扱いたい場合は、設計・実装方針の追加検討が必要です。
---
| Step | 目的 | 影響範囲 |
| ---- | ---- | -------- |
| 1 | `tracks.ts` 導入／既存 Faust を Track 化／`window.faustNode` 互換維持 | 追加のみ |
| 2 | Mic 有効化で MicTrack 作成／メータ接続を Track ベース化 | InputManager 微修正 |
| 3 | **複数入出力トラックのアサインUI（Microphone Routing拡張）と入出力テスト機能の導入**<br>（立体音響・複数マイキング・マルチスピーカー等に対応。エンジンON後に各入出力を自由にアサイン・テストできる） | Routing/UI/InputManager拡張 |
| 4 | Faust以外の外部インタラクション（コントローラー入力・MIDI・Web API等）をTrack/ParamRegistry/EventBus経由で扱える土台を用意 | TrackKind拡張・API追加 |
| 5 | 複数 Faust DSP ロード API (`attachFaust`) | 新UI準備 |
| 6 | ParamRegistry 追加 → 既存自動生成UI内部置換 | `renderFaustParams` |
| 7 | TrackList UI（mute/solo/volume）導入 | 新UI追加 |
| 8 | RoutingMatrix 骨組（現状 master のみ）→ 将来 Aux 拡張 | 音声再配線ユーティリティ |
| 9 | Transport（play/pause/position） + SampleClip MVP | 新ファイル |
| 10 | AutomationPoint（Param変化） | Scheduler 拡張 |
| 11 | ProjectState 保存/復元 | JSON I/O |
| 12 | Aux Bus / Send / Sidechain / Scene | 後期 |

---

## Transport / Timeline (後半)
MVP: 秒ベース `Transport` + lookAhead scheduler(0.2s / 50ms tick)  
後: TempoMap, Beat変換, Automation補間, Clip編集。

---

## パラメータ管理
- 初回 getJSON → 正規化 → キャッシュ
- UIは Track + DSP選択でフィルタ
- Set: `paramRegistry.set(trackId,dspIndex,address,value)`
- Automation対応時: scheduler が paramRegistry 経由で apply (AudioParamなら `setValueAtTime`)

---

## Routing 戦略（段階）
1. 固定: Track.output → masterGain
2. Matrix: assignments[] を再構築時にフェード（5–10ms）で disconnect/connect
3. Aux: Send用 GainNode を Track毎生成 → BusTrack.input に複数接続
4. Sidechain: ControlBus (Analyser/EnvelopeFollower) から ParamDrive

---

## 保存形式 (例)
```json
{
  "version": 1,
  "tracks": [
    { "id": "synth1", "kind": "faust", "dsp": [{ "type": "faust", "path": "/dsp/mysynth.dsp", "params": {...}}], "volume":1, "mute":false }
  ],
  "routing": [{ "sourceId":"synth1", "busId":"master", "gain":1, "enabled":true }],
  "clips": [],
  "automation": []
}
```

---

## リスク & 回避
| リスク | 回避策 |
| ------ | ------ |
| 複数Faust初期化遅延 | 遅延ロード・同一hashキャッシュ |
| 再配線ポップノイズ | Gainフェード (setValueAtTime) |
| UI肥大によるパフォーマンス低下 | requestAnimationFrame バッチ／非表示停止 |
| 互換崩壊 | `window.faustNode` 段階的撤去計画 |
| State不整合 | EventBus 1出所 (Track追加/削除/param変更) |

---

## 最初の具体タスク（推奨順）
1. `src/audio/tracks.ts` 追加 + `createTrackEnvironment` 実装
2. controller.ts の initAudio 完了時に Track 包装
3. `window.audioAPI.listTracks()` を確認
4. Mic 有効化時に MicTrack 生成（出力は master）
5. ParamRegistry 下書き（今は透過 delegates）
6. TrackList UI 最小（列挙＋volume）

---

## 以降の拡張トリガ
- サンプル再生要件成立 → Transport/Clips 開始
- エフェクトチェーン差替頻発 → DSPホットスワップ（旧/新クロスフェード）
- 外部保存ニーズ → ProjectState 先行

---

## 成功条件 (短期)
- 既存UI壊さず複数 Faust Track 追加が可能
- MicTrack が TrackList に現れ volume/mute 反映
- ParamUI が Track切替できる（将来）

## 成功条件 (中期)
- RoutingMatrix で ON/OFF / Gain 変更即反映
- 再生/停止 + SampleClip スケジュール動作
- 保存/復元で同じ音構成が再現

---

## まとめ
この設計では、Faustだけでなくコントローラー入力やMIDI、Web APIなど「外部インタラクション」もTrack/ParamRegistry/EventBusの抽象を通じて柔軟に統合できます。
小規模ステップで Track/DSP/Routing/Param を分離し、互換レイヤを残しつつ徐々に UI とロジックを解耦。後段で Transport/Automation や外部インタラクションも自然追加。

また、将来的にはMax/MSPのような「ノード（Track/DSP/Bus/Param）を線でつなぐ」ビジュアルエディタや、
信号フロー・ルーティング・パラメータをスタイリッシュに可視化・編集できるUIも目指します。
Faustの自動ビジュアライズ機能や、全体構成のテキスト記述との連携も意識し、
「直感的で美しいパッチング体験」を提供できるよう拡張していきます。

> 次: Step1 の `tracks.ts` 具体実装へ進むか指示してください。
