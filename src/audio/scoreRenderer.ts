// src/audio/scoreRenderer.ts
import { Factory } from 'vexflow';

/**
 * アーティキュレーション（奏法記号）
 */
export type Articulation =
    | 'staccato'        // スタッカート (.)
    | 'tenuto'          // テヌート (-)
    | 'accent'          // アクセント (>)
    | 'marcato'         // マルカート (^)
    | 'fermata'         // フェルマータ
    | 'trill'           // トリル (tr)
    | 'mordent'         // モルデント
    | 'turn';           // ターン

/**
 * ダイナミクス（強弱記号）
 */
export type Dynamic =
    | 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff'
    | 'sfz' | 'fp' | 'crescendo' | 'decrescendo';

/**
 * 楽譜データの型定義
 */
export interface ScoreData {
    clef: 'treble' | 'bass' | 'alto' | 'tenor';
    timeSignature?: string;
    notes: string; // EasyScore形式の文字列 (例: "B4/q, C5/q, D5/h")

    // 演奏記号
    articulations?: Articulation[];  // アーティキュレーション
    dynamics?: Dynamic[];            // ダイナミクス

    // 指示テキスト
    instructionText?: string;        // 演奏指示 (例: "rit.", "accel.", "pizz.")
    techniqueText?: string;          // 奏法指示 (例: "sul pont.", "con sord.")
    tempoText?: string;              // テンポ指示 (例: "Allegro", "Lento")

    // 位置調整オプション
    staveX?: number;      // 五線譜の開始X座標（デフォルト: 自動中央配置）
    staveY?: number;      // 五線譜のY座標（デフォルト: 10）
    staveWidth?: number;  // 五線譜の幅（デフォルト: コンテナ幅 - 40）
    notePadding?: number; // 音符の左パディング（デフォルト: 自動）
}

/**
 * VexFlowを使用した楽譜レンダラー
 */
export class ScoreRenderer {
    private factory: any;
    private containerId: string;
    private lastScoreData: ScoreData | null = null;

    constructor(private container: HTMLElement) {
        // コンテナにIDを設定（なければ生成）
        if (!container.id) {
            container.id = `score-${Math.random().toString(36).substr(2, 9)}`;
        }
        this.containerId = container.id;

        // コンテナをクリア
        this.container.innerHTML = '';
    }

    private getRendererDimensions() {
        const rect = this.container.getBoundingClientRect();
        const width = Math.max(rect.width || this.container.clientWidth || 0, 200);
        const height = Math.max(rect.height || this.container.clientHeight || 0, 160);
        return { width, height };
    }

    /**
     * 楽譜をレンダリング
     */
    render(scoreData: ScoreData): void {
        try {
            const { width, height } = this.getRendererDimensions();

            // コンテナを完全にクリア（すべての子要素を削除）
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild);
            }

            // Factoryを作成
            this.factory = new Factory({
                renderer: { elementId: this.containerId, width, height }
            });

            const score = this.factory.EasyScore();

            // 拍子記号の有無で処理を分岐
            if (scoreData.timeSignature) {
                // 拍子記号ありの場合: Systemを使用
                const system = this.factory.System({ width: width - 20 });
                system
                    .addStave({
                        voices: [
                            score.voice(score.notes(scoreData.notes))
                        ]
                    })
                    .addClef(scoreData.clef)
                    .addTimeSignature(scoreData.timeSignature);
            } else {
                // 拍子記号なしの場合: Staveを直接作成
                const staveWidth = scoreData.staveWidth ?? (width - 40);

                // staveXが指定されていない場合、中央に配置
                let staveX: number;
                if (scoreData.staveX !== undefined) {
                    staveX = scoreData.staveX;
                } else {
                    // 五線譜を中央に配置（コンテナ幅と五線譜幅の差を2で割る）
                    staveX = Math.max((width - staveWidth) / 2, 10);
                }

                const staveY = scoreData.staveY ?? 10;

                const stave = this.factory.Stave({ x: staveX, y: staveY, width: staveWidth });
                stave.addClef(scoreData.clef);

                // 音符を作成（時間チェックを無効化するため、十分な時間を設定）
                const notes = score.notes(scoreData.notes);
                const voice = this.factory.Voice({ time: { num_beats: 16, beat_value: 4 } });
                voice.setStrict(false); // 厳密な時間チェックを無効化
                voice.addTickables(notes);

                // フォーマッターで音符を配置
                const formatter = this.factory.Formatter();
                if (scoreData.notePadding !== undefined) {
                    formatter.format([voice], staveWidth, {
                        align_rests: false,
                        context: null as any
                    });
                } else {
                    formatter.joinVoices([voice]).formatToStave([voice], stave);
                }
            }

            // 描画
            this.factory.draw();

            this.lastScoreData = { ...scoreData };
        } catch (error) {
            console.error('Score rendering error:', error);
            // エラー時はコンテナにメッセージを表示
            this.container.innerHTML = '<div style="padding: 1rem; color: #999;">楽譜の読み込みに失敗しました</div>';
        }
    }

    /**
     * 楽譜をクリア
     */
    clear(): void {
        // すべての子要素を削除
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        this.lastScoreData = null;
    }

    /**
     * レンダラーをリサイズ
     */
    resize(): void {
        if (this.lastScoreData) {
            this.render(this.lastScoreData);
        }
    }
}
