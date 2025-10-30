// src/sequence/sections/section1.ts

/**
 * セクション1: 導入部
 * 
 * このファイルは後方互換性のために残されています。
 * 実際のセクション定義は src/works/composition.ts の Section A に統合されました。
 * 
 * 楽譜データ、演奏指示、映像指示などすべて composition.ts で一元管理されます。
 */

import { ScoreData } from '../../audio/scoreRenderer';

/**
 * @deprecated composition.ts の Section A notation events を使用してください
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
        dynamics: ['mp'],
        instructionText: 'none',
        staveWidth: 150
    },

    // ホルン2の楽譜
    horn2: {
        clef: 'treble',
        notes: 'B4/q',
        articulations: ['staccato'],
        dynamics: ['mp'],
        instructionText: 'none',
        staveWidth: 150
    },

    // トロンボーンの楽譜
    trombone: {
        clef: 'bass',
        notes: 'B3/q',  // トロンボーンは1オクターブ下
        articulations: ['staccato'],
        dynamics: ['mp'],
        instructionText: 'none',
        staveWidth: 150
    }
};

/**
 * @deprecated composition.ts の Section A events を使用してください
 * この関数は後方互換性のために残されています。
 */
export function createSection1Events(): never[] {
    console.warn('createSection1Events() is deprecated. Use composition.ts Section A events instead.');
    return [];
}

/**
 * 楽譜データを取得(プレイヤー番号から)
 * @deprecated composition.ts の notation events を使用してください
 */
export function getSection1ScoreForPlayer(playerNumber: number): ScoreData {
    console.warn('getSection1ScoreForPlayer() is deprecated. Use composition.ts notation events instead.');
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
