// src/sequence/types.ts

import { MusicalTime, TempoInfo } from '../audio/musicalTimeManager';
import { ScoreData } from '../audio/scoreRenderer';

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
    type: 'sound' | 'visual' | 'cue' | 'control' | 'score';  // イベントタイプ
    target?: string;               // 対象 (例: "horn1", "trombone", "visual")
    action: string;                // アクション名
    parameters: Record<string, any>; // パラメータ
}

/**
 * 楽譜表示イベント
 */
export interface ScoreEvent extends SectionEvent {
    type: 'score';
    action: 'showScore' | 'updateScore' | 'clearScore';
    parameters: {
        scoreData?: ScoreData;     // 表示する楽譜データ
        target: 'current' | 'next'; // 表示先 (現在/次)
        player?: number;            // 対象奏者 (省略時は全員)
        transition?: 'immediate' | 'fade'; // 遷移方法
    };
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

/**
 * 楽曲全体の定義
 */
export interface WorkDefinition {
    title: string;                 // 作品タイトル
    totalDuration: number;         // 総演奏時間（秒）
    defaultTempo: TempoInfo;       // デフォルトテンポ
    sections: SectionDefinition[]; // セクションリスト
}
