# 作曲方法ガイド - 時間管理の実装

このドキュメントでは、実際に作品の時間的構成をコードに落とし込む方法を説明します。

## 📋 目次

1. [基本的な流れ](#基本的な流れ)
2. [ファイル構成](#ファイル構成)
3. [セクションの定義方法](#セクションの定義方法)
4. [具体的な実装例](#具体的な実装例)
5. [イベントのスケジューリング](#イベントのスケジューリング)

---

## 基本的な流れ

```
1. docs/作品内容_ユーザー記入.md で構成を記述
   ↓
2. src/sequence/upSequence.ts でセクション構造を定義
   ↓
3. src/sequence/sections/ で各セクションの詳細を実装
   ↓
4. src/audio/musicalTimeManager.ts でスケジューリング
   ↓
5. src/performance.ts でパフォーマンス全体を統合
```

---

## ファイル構成

### 1. `docs/作品内容_ユーザー記入.md` 
**役割**: 作品の全体構成を日本語で記述（設計図）

```markdown
## 時間的構成
### 1 - 導入部 (0:00-2:00)
単音からの発展。B4を想定。

### 2 - 点の移動 (2:00-5:00)
点の座標が動き始め、音高も変化。

### 3 - 回転と増幅 (5:00-9:00)
軸ごと回転し、音数と音圧が増す。
```

### 2. `src/sequence/upSequence.ts`
**役割**: セクション構造とタイミングの定義

### 3. `src/sequence/sections/`
**役割**: 各セクションの詳細な実装

### 4. `src/performance.ts`
**役割**: パフォーマンス全体の統合と実行

---

## セクションの定義方法

### Step 1: セクションの型定義

まず、セクションの基本的な型を定義します：

```typescript
// src/sequence/types.ts (新規作成)

import { MusicalTime, TempoInfo } from '../audio/musicalTimeManager';

/**
 * セクションの基本情報
 */
export interface Section {
    id: string;                    // セクションID (例: "section1", "intro")
    name: string;                  // セクション名 (例: "導入部")
    startTime: MusicalTime;        // 開始時間
    endTime?: MusicalTime;         // 終了時間 (省略可)
    duration?: MusicalTime;        // 継続時間 (省略可)
    tempo?: TempoInfo;             // テンポ情報
    description?: string;          // 説明
}

/**
 * セクション内のイベント
 */
export interface SectionEvent {
    id: string;                    // イベントID
    time: MusicalTime;             // 発生時間
    type: 'sound' | 'visual' | 'cue' | 'control';  // イベントタイプ
    target?: string;               // 対象 (例: "horn1", "trombone", "visual")
    action: string;                // アクション名
    parameters: Record<string, any>; // パラメータ
}

/**
 * 完全なセクション定義
 */
export interface SectionDefinition extends Section {
    events: SectionEvent[];        // セクション内のイベントリスト
    onEnter?: () => void;          // セクション開始時の処理
    onExit?: () => void;           // セクション終了時の処理
    onUpdate?: (time: number) => void; // 定期的な更新処理
}
```

### Step 2: 楽曲全体の構造を定義

```typescript
// src/sequence/upSequence.ts

import { SectionDefinition } from './types';
import { MusicalTime, TempoInfo } from '../audio/musicalTimeManager';

/**
 * 楽曲全体の構成
 */
export class UpSequence {
    // 基本情報
    readonly title = "Acoustic Automaton / Automatonic Assembly";
    readonly totalDuration = 720; // 12分 = 720秒
    readonly defaultTempo: TempoInfo = {
        bpm: 60,
        numerator: 4,
        denominator: 4
    };

    // セクション定義
    readonly sections: SectionDefinition[] = [
        {
            id: "section1",
            name: "導入部",
            description: "聴衆に期待を与える、静かな立ち上がり。単音からの発展。",
            startTime: { type: 'absolute', seconds: 0 },
            duration: { type: 'absolute', seconds: 120 }, // 2分
            tempo: this.defaultTempo,
            events: [
                // セクション1のイベントは別ファイルで定義
            ]
        },
        {
            id: "section2",
            name: "点の移動",
            description: "点の座標が動き始め、インスタンスの音高も変化。",
            startTime: { type: 'absolute', seconds: 120 },
            duration: { type: 'absolute', seconds: 180 }, // 3分
            tempo: this.defaultTempo,
            events: []
        },
        {
            id: "section3",
            name: "回転と増幅",
            description: "軸ごと回転し、音数と音圧が増す。",
            startTime: { type: 'absolute', seconds: 300 },
            duration: { type: 'absolute', seconds: 240 }, // 4分
            tempo: this.defaultTempo,
            events: []
        }
        // ... 他のセクション
    ];

    /**
     * セクションIDから定義を取得
     */
    getSectionById(id: string): SectionDefinition | undefined {
        return this.sections.find(s => s.id === id);
    }

    /**
     * 時間からセクションを取得
     */
    getSectionAtTime(seconds: number): SectionDefinition | undefined {
        for (const section of this.sections) {
            if (section.startTime.type === 'absolute') {
                const start = section.startTime.seconds;
                const duration = section.duration?.type === 'absolute' 
                    ? section.duration.seconds 
                    : 0;
                const end = start + duration;
                
                if (seconds >= start && seconds < end) {
                    return section;
                }
            }
        }
        return undefined;
    }
}
```

---

## 具体的な実装例

### 例1: セクション1「導入部」の詳細実装

```typescript
// src/sequence/sections/section1.ts

import { SectionEvent } from '../types';
import { MusicalTime } from '../../audio/musicalTimeManager';

/**
 * セクション1: 導入部
 * - B4の単音スタッカート
 * - リバーブ + 減衰後保続
 * - 電子音が混ざる
 */
export function createSection1Events(): SectionEvent[] {
    const events: SectionEvent[] = [];

    // 1. 最初の音 (0秒)
    events.push({
        id: 'section1_note_001',
        time: { type: 'absolute', seconds: 0 },
        type: 'sound',
        target: 'horn1',
        action: 'playNote',
        parameters: {
            pitch: 'B4',
            duration: 0.2, // スタッカート
            velocity: 0.6,
            effect: 'reverbSustain'
        }
    });

    // 2. 対応する映像フラッシュ
    events.push({
        id: 'section1_visual_001',
        time: { type: 'absolute', seconds: 0 },
        type: 'visual',
        target: 'screen_left',
        action: 'flash',
        parameters: {
            color: '#ffffff',
            decay: 2.0 // 2秒かけて減衰
        }
    });

    // 3. 軸の表示
    events.push({
        id: 'section1_axis_001',
        time: { type: 'absolute', seconds: 0 },
        type: 'visual',
        target: 'axis',
        action: 'showLine',
        parameters: {
            position: [0, 0, 0],
            decay: 2.0
        }
    });

    // 4. 2秒後に次の音
    events.push({
        id: 'section1_note_002',
        time: { type: 'absolute', seconds: 2 },
        type: 'sound',
        target: 'horn2',
        action: 'playNote',
        parameters: {
            pitch: 'B4',
            duration: 0.2,
            velocity: 0.6,
            effect: 'reverbSustain'
        }
    });

    // ... さらにイベントを追加

    // パターンを繰り返す場合
    for (let i = 0; i < 20; i++) {
        const time = i * 3; // 3秒間隔
        
        events.push({
            id: `section1_pattern_${i}`,
            time: { type: 'absolute', seconds: time },
            type: 'sound',
            target: i % 3 === 0 ? 'horn1' : i % 3 === 1 ? 'horn2' : 'trombone',
            action: 'playNote',
            parameters: {
                pitch: 'B4',
                duration: 0.2,
                velocity: 0.5 + Math.random() * 0.3,
                effect: 'reverbSustain'
            }
        });
    }

    // 電子音の追加 (20秒から)
    events.push({
        id: 'section1_electronic_start',
        time: { type: 'absolute', seconds: 20 },
        type: 'control',
        target: 'synth',
        action: 'startElectronicLayer',
        parameters: {
            pitch: 'B4',
            interval: 4, // 4秒間隔
            count: 10    // 10回
        }
    });

    return events;
}
```

### 例2: より複雑な時間指定（拍子・小節ベース）

```typescript
// src/sequence/sections/section2.ts

import { SectionEvent } from '../types';

/**
 * セクション2: 点の移動
 * 拍子に基づいた精密なタイミング
 */
export function createSection2Events(): SectionEvent[] {
    const events: SectionEvent[] = [];

    // 小節・拍ベースの指定
    // 例: 10小節目の2拍目
    events.push({
        id: 'section2_cue_bar10',
        time: { 
            type: 'musical', 
            bars: 10, 
            beats: 2,
            tempo: { bpm: 60, numerator: 4, denominator: 4 }
        },
        type: 'cue',
        target: 'all',
        action: 'showCue',
        parameters: {
            message: '次のセクションへ移行準備',
            priority: 'normal'
        }
    });

    // 相対的なテンポベースの指定
    // 例: 64拍後
    events.push({
        id: 'section2_tempo_relative',
        time: { 
            type: 'tempo_relative', 
            beats: 64,
            tempo: { bpm: 60, numerator: 4, denominator: 4 }
        },
        type: 'control',
        target: 'system',
        action: 'changeSection',
        parameters: {
            nextSection: 'section3'
        }
    });

    return events;
}
```

---

## イベントのスケジューリング

### パフォーマンスクラスの作成

```typescript
// src/performance.ts (既存ファイルを拡張)

import { MusicalTimeManager, PerformanceEvent } from './audio/musicalTimeManager';
import { UpSequence } from './sequence/upSequence';
import { createSection1Events } from './sequence/sections/section1';
import { createSection2Events } from './sequence/sections/section2';

export class Performance {
    private timeManager: MusicalTimeManager;
    private sequence: UpSequence;
    private currentSectionId: string | null = null;

    constructor(audioContext: AudioContext) {
        this.timeManager = new MusicalTimeManager(audioContext);
        this.sequence = new UpSequence();
        
        // セクションイベントを統合
        this.initializeSections();
        
        // タイムマネージャーのコールバック設定
        this.setupCallbacks();
    }

    /**
     * セクション初期化
     */
    private initializeSections(): void {
        // セクション1のイベントを追加
        const section1 = this.sequence.getSectionById('section1');
        if (section1) {
            section1.events = createSection1Events();
        }

        // セクション2のイベントを追加
        const section2 = this.sequence.getSectionById('section2');
        if (section2) {
            section2.events = createSection2Events();
        }

        // ... 他のセクション
    }

    /**
     * コールバック設定
     */
    private setupCallbacks(): void {
        // 拍ごとのコールバック
        this.timeManager.onBeat((bar, beat) => {
            console.log(`🎵 Bar ${bar}, Beat ${beat}`);
            
            // メトロノームを奏者に送信
            this.sendMetronomePulse(bar, beat);
        });

        // イベント実行のコールバック
        this.timeManager.onEvent((event) => {
            this.executeEvent(event);
        });
    }

    /**
     * 演奏開始
     */
    start(): void {
        console.log('🎪 Performance starting...');
        
        // 全てのイベントをスケジュール
        this.scheduleAllEvents();
        
        // タイムマネージャー開始
        this.timeManager.start();
        
        console.log('✅ Performance started');
    }

    /**
     * 全イベントをスケジュール
     */
    private scheduleAllEvents(): void {
        for (const section of this.sequence.sections) {
            for (const event of section.events) {
                // PerformanceEventに変換
                const perfEvent: PerformanceEvent = {
                    id: event.id,
                    time: event.time,
                    type: event.type as any,
                    action: event.action,
                    parameters: event.parameters,
                    description: `${section.name}: ${event.action}`
                };
                
                this.timeManager.scheduleEvent(perfEvent);
            }
        }
    }

    /**
     * イベント実行
     */
    private executeEvent(event: PerformanceEvent): void {
        console.log(`⚡ Executing event: ${event.id} - ${event.action}`);
        
        switch (event.type) {
            case 'audio':
                this.executeAudioEvent(event);
                break;
            case 'visual':
                this.executeVisualEvent(event);
                break;
            case 'cue':
                this.executeCueEvent(event);
                break;
            case 'control':
                this.executeControlEvent(event);
                break;
        }
    }

    /**
     * 音響イベント実行
     */
    private executeAudioEvent(event: PerformanceEvent): void {
        // 音響処理を実行
        const { target, action, parameters } = event;
        
        if (action === 'playNote') {
            // 音符を演奏
            console.log(`🎺 Playing note: ${parameters?.pitch} on ${target}`);
            // 実際の音響処理をここに実装
        }
    }

    /**
     * 映像イベント実行
     */
    private executeVisualEvent(event: PerformanceEvent): void {
        const { target, action, parameters } = event;
        
        if (action === 'flash') {
            console.log(`✨ Flash on ${target}`);
            // ビジュアライザーにメッセージを送信
            this.sendToVisualizer({
                type: 'flash',
                target,
                parameters
            });
        }
    }

    /**
     * キューイベント実行
     */
    private executeCueEvent(event: PerformanceEvent): void {
        const { parameters } = event;
        console.log(`📢 Cue: ${parameters?.message}`);
        
        // プレイヤー画面にメッセージを送信
        this.sendToPlayers({
            type: 'cue',
            message: parameters?.message,
            priority: parameters?.priority
        });
    }

    /**
     * 制御イベント実行
     */
    private executeControlEvent(event: PerformanceEvent): void {
        const { action, parameters } = event;
        
        if (action === 'changeSection') {
            this.changeSection(parameters?.nextSection);
        }
    }

    /**
     * セクション変更
     */
    private changeSection(sectionId: string): void {
        const section = this.sequence.getSectionById(sectionId);
        if (!section) return;

        console.log(`🎬 Changing to section: ${section.name}`);
        this.currentSectionId = sectionId;

        // セクション開始処理
        if (section.onEnter) {
            section.onEnter();
        }

        // プレイヤー画面を更新
        this.sendToPlayers({
            type: 'current-section',
            data: { name: section.name }
        });
    }

    /**
     * メトロノームパルスを送信
     */
    private sendMetronomePulse(bar: number, beat: number): void {
        const channel = new BroadcastChannel('performance-control');
        channel.postMessage({
            type: 'metronome-pulse',
            data: { bar, beat }
        });
        channel.close();
    }

    /**
     * ビジュアライザーにメッセージ送信
     */
    private sendToVisualizer(message: any): void {
        const channel = new BroadcastChannel('visualizer-control');
        channel.postMessage(message);
        channel.close();
    }

    /**
     * プレイヤー画面にメッセージ送信
     */
    private sendToPlayers(message: any): void {
        const channel = new BroadcastChannel('performance-control');
        channel.postMessage(message);
        channel.close();
    }
}
```

---

## 使用方法

### パフォーマンスページで使用する

```typescript
// src/performance.ts の初期化部分

// AudioContext初期化
const audioContext = new AudioContext();

// Performanceクラスのインスタンス作成
const performance = new Performance(audioContext);

// Playボタンで開始
document.getElementById('play-btn')?.addEventListener('click', () => {
    performance.start();
});
```

---

## まとめ

### 作曲のワークフロー

1. **設計**: `docs/作品内容_ユーザー記入.md` に日本語で構成を書く
2. **構造定義**: `src/sequence/upSequence.ts` でセクション構造を定義
3. **詳細実装**: `src/sequence/sections/` で各セクションの詳細を実装
4. **統合**: `src/performance.ts` で全体を統合
5. **テスト**: パフォーマンスページで実行・確認

### ポイント

- **時間指定の柔軟性**: 絶対時間、音楽的時間（小節・拍）、相対時間など多様な指定方法
- **イベント駆動**: 全てのアクションをイベントとして記述
- **分離された設計**: セクションごとに独立したファイルで管理
- **リアルタイム性**: AudioContextベースの高精度スケジューリング

この方法により、作曲内容を体系的に、かつ柔軟にコード化できます！
