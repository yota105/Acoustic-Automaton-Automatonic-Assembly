// src/sequence/sections/section1.ts

import { SectionEvent, ScoreEvent } from '../types';
import { ScoreData } from '../../audio/scoreRenderer';

/**
 * セクション1: 導入部
 * 
 * 聴衆に期待を与える、静かな立ち上がり。単音からの発展。
 * - B4の単音スタッカート
 * - リバーブ + 減衰後保続
 * - 電子音が混ざる
 */

/**
 * セクション1の楽譜データ定義
 */
export const section1ScoreData: {
    horn1: ScoreData;
    horn2: ScoreData;
    trombone: ScoreData;
} = {
    // ホルン1の楽譜
    horn1: {
        clef: 'treble',
        notes: 'B4/q',
        articulations: ['staccato'],
        dynamics: ['p'],
        instructionText: 'with reverb',
        staveWidth: 150
    },

    // ホルン2の楽譜
    horn2: {
        clef: 'treble',
        notes: 'B4/q',
        articulations: ['staccato'],
        dynamics: ['p'],
        instructionText: 'with reverb',
        staveWidth: 150
    },

    // トロンボーンの楽譜
    trombone: {
        clef: 'bass',
        notes: 'B3/q',  // トロンボーンは1オクターブ下
        articulations: ['staccato'],
        dynamics: ['p'],
        instructionText: 'with reverb',
        staveWidth: 150
    }
};

/**
 * セクション1のイベントリストを生成
 */
export function createSection1Events(): SectionEvent[] {
    const events: SectionEvent[] = [];

    // 1. 最初の楽譜を表示 (0秒時点)
    events.push({
        id: 'section1_score_init_horn1',
        time: { type: 'absolute', seconds: 0 },
        type: 'score',
        target: 'horn1',
        action: 'showScore',
        parameters: {
            scoreData: section1ScoreData.horn1,
            target: 'current',
            player: 1,
            transition: 'immediate'
        }
    } as ScoreEvent);

    events.push({
        id: 'section1_score_init_horn2',
        time: { type: 'absolute', seconds: 0 },
        type: 'score',
        target: 'horn2',
        action: 'showScore',
        parameters: {
            scoreData: section1ScoreData.horn2,
            target: 'current',
            player: 2,
            transition: 'immediate'
        }
    } as ScoreEvent);

    events.push({
        id: 'section1_score_init_trombone',
        time: { type: 'absolute', seconds: 0 },
        type: 'score',
        target: 'trombone',
        action: 'showScore',
        parameters: {
            scoreData: section1ScoreData.trombone,
            target: 'current',
            player: 3,
            transition: 'immediate'
        }
    } as ScoreEvent);

    // 2. 最初の音 (0秒)
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

    // 3. 対応する映像フラッシュ
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

    // 4. 軸の表示
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

    // 5. パターンを繰り返す (3秒間隔で20回)
    for (let i = 0; i < 20; i++) {
        const time = i * 3; // 3秒間隔
        const instrumentIndex = i % 3;
        const target = instrumentIndex === 0 ? 'horn1' : instrumentIndex === 1 ? 'horn2' : 'trombone';
        const pitch = target === 'trombone' ? 'B3' : 'B4';

        events.push({
            id: `section1_pattern_${i}`,
            time: { type: 'absolute', seconds: time },
            type: 'sound',
            target,
            action: 'playNote',
            parameters: {
                pitch,
                duration: 0.2,
                velocity: 0.5 + Math.random() * 0.3,
                effect: 'reverbSustain'
            }
        });

        // 映像も同期
        const screenTarget = instrumentIndex === 0 ? 'screen_left' : instrumentIndex === 1 ? 'screen_center' : 'screen_right';
        events.push({
            id: `section1_visual_${i}`,
            time: { type: 'absolute', seconds: time },
            type: 'visual',
            target: screenTarget,
            action: 'flash',
            parameters: {
                color: '#ffffff',
                decay: 2.0
            }
        });
    }

    // 6. 電子音の追加 (20秒から)
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

    // 7. セクション2への移行準備 (110秒 = 2分弱)
    // 次のセクションの楽譜を「Next」エリアに表示
    events.push({
        id: 'section1_score_next_section2',
        time: { type: 'absolute', seconds: 110 },
        type: 'score',
        target: 'all',
        action: 'showScore',
        parameters: {
            scoreData: {
                clef: 'treble',
                notes: 'B4/q, C5/q',
                instructionText: 'moving pitches',
                staveWidth: 200
            },
            target: 'next',
            transition: 'fade'
        }
    } as ScoreEvent);

    return events;
}

/**
 * 楽譜データを取得（プレイヤー番号から）
 */
export function getSection1ScoreForPlayer(playerNumber: number): ScoreData {
    switch (playerNumber) {
        case 1:
            return section1ScoreData.horn1;
        case 2:
            return section1ScoreData.horn2;
        case 3:
            return section1ScoreData.trombone;
        default:
            return section1ScoreData.horn1; // デフォルト
    }
}
