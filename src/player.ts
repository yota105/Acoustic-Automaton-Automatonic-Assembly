// Player Screen TypeScript
// URLパラメータから奏者番号を取得して、それぞれに異なる指示を表示

// URLパラメータから奏者番号取得
const params = new URLSearchParams(window.location.search);
const playerNumber = params.get('player') || '1';

// DOM要素の取得
const playerIdEl = document.getElementById('player-id');
const rehearsalMarkEl = document.getElementById('rehearsal-mark');
const elapsedTimeEl = document.getElementById('elapsed-time');
const countdownCanvas = document.getElementById('countdown-canvas') as HTMLCanvasElement;
const currentSectionNameEl = document.getElementById('current-section-name');
const nextSectionNameEl = document.getElementById('next-section-name');
const nextSectionDisplayEl = document.getElementById('next-section-display');
const menuButton = document.getElementById('menu-button');
const menuModal = document.getElementById('menu-modal');
const menuClose = document.getElementById('menu-close');
const menuPlayerName = document.getElementById('menu-player-name');

// プレイヤー情報を表示
if (playerIdEl) {
    playerIdEl.textContent = `Player ${playerNumber}`;
}

// メニューモーダルにもプレイヤー名を設定
if (menuPlayerName) {
    menuPlayerName.textContent = `Player ${playerNumber}`;
}

// メニューの開閉
if (menuButton && menuModal) {
    menuButton.addEventListener('click', () => {
        menuModal.classList.add('active');
    });
}

if (menuClose && menuModal) {
    menuClose.addEventListener('click', () => {
        menuModal.classList.remove('active');
    });
}

// モーダルの背景をクリックしても閉じる
if (menuModal) {
    menuModal.addEventListener('click', (e) => {
        if (e.target === menuModal) {
            menuModal.classList.remove('active');
        }
    });
}

// 円形ゲージの描画クラス
class CircularGauge {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private centerX: number = 0;
    private centerY: number = 0;
    private radius: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas context not available');
        }
        this.ctx = context;
        this.setupCanvas();
        window.addEventListener('resize', () => this.setupCanvas());
    }

    private setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;
        this.radius = Math.min(rect.width, rect.height) * 0.35;
    }

    draw(progress: number, text: string, color: string = '#FFA500', size: 'small' | 'medium' | 'large' = 'medium') {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        // サイズ調整
        let radiusMultiplier = 1;
        let lineWidth = 16;
        let fontSize = 20;

        switch (size) {
            case 'small':
                radiusMultiplier = 0.7;
                lineWidth = 12;
                fontSize = 16;
                break;
            case 'large':
                radiusMultiplier = 1.3;
                lineWidth = 24;
                fontSize = 28;
                break;
        }

        const drawRadius = this.radius * radiusMultiplier;

        // 背景の円は描画しない（プログレスバーのみで表現）

        // 残り部分（まだ経過していない部分）をカラーで描画
        if (progress > 0) {
            this.ctx.beginPath();
            const startAngle = -Math.PI / 2; // 12時の位置から開始
            const endAngle = startAngle + (Math.PI * 2 * progress);
            this.ctx.arc(this.centerX, this.centerY, drawRadius, startAngle, endAngle);
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = lineWidth;
            this.ctx.lineCap = 'butt'; // 境界を垂直にする
            this.ctx.stroke();
        }

        // 経過部分（カラーから灰色になった部分）を灰色で描画
        if (progress < 1) {
            this.ctx.beginPath();
            const startAngle = -Math.PI / 2 + (Math.PI * 2 * progress); // カラー部分の終点から開始
            const endAngle = -Math.PI / 2 + (Math.PI * 2); // 一周
            this.ctx.arc(this.centerX, this.centerY, drawRadius, startAngle, endAngle);
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = lineWidth;
            this.ctx.lineCap = 'butt'; // 境界を垂直にする
            this.ctx.stroke();
        }

        // 文字の背景（黒い円） - サークルと同じサイズ
        const textBackgroundRadius = drawRadius;
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, textBackgroundRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#000000';
        this.ctx.fill();

        // 中央のテキスト（白色）
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = text.split('\n');
        const lineHeight = fontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        const startY = this.centerY - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line, index) => {
            this.ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
            this.ctx.fillText(line, this.centerX, startY + index * lineHeight);
        });
    }

    clear() {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
    }
}

// ゲージのインスタンス作成
let countdownGauge: CircularGauge | null = null;

if (countdownCanvas) {
    countdownGauge = new CircularGauge(countdownCanvas);
}

// ヘッダー要素（パルスアニメーション用）
const headerEl = document.getElementById('header');
let isAnimating = false;

// アニメーション終了イベントでクリーンアップ
if (headerEl) {
    headerEl.addEventListener('animationend', () => {
        headerEl.classList.remove('pulse');
        isAnimating = false;
    });
}

function triggerMetronomePulse() {
    if (!headerEl) return;

    // 既にアニメーション中の場合は無視（2重発火を防止）
    if (isAnimating) {
        console.log('Metronome pulse skipped (already animating)');
        return;
    }

    // アニメーション開始
    isAnimating = true;

    // 既存のクラスを削除してリセット（force reflow）
    headerEl.classList.remove('pulse');
    void headerEl.offsetWidth; // リフローを強制してアニメーションを確実にリスタート

    // パルスクラスを追加
    headerEl.classList.add('pulse');
    console.log('Metronome pulse triggered');
}

// カウントダウンの表示例
function showCountdown(barsRemaining: number, beatsRemaining: number) {
    if (!countdownGauge) return;

    let text = '';
    let progress = 0;
    let color = '#FFA500';

    if (barsRemaining > 0) {
        text = `${barsRemaining}\nbars`;
        progress = Math.min(barsRemaining / 8, 1); // 8小節を最大と仮定
        color = barsRemaining > 2 ? '#FFEB3B' : '#FFA500';
    } else if (beatsRemaining > 1) {
        text = `${beatsRemaining}`;
        progress = beatsRemaining / 4; // 4拍を最大と仮定
        color = beatsRemaining > 2 ? '#FFA500' : '#FF5722';
    } else if (beatsRemaining === 1) {
        text = '1';
        progress = 0.25;
        color = '#FF0000';
    }

    countdownGauge.draw(progress, text, color, 'medium');
}

// 滑らかなカウントダウンの表示
function showSmoothCountdown(seconds: number, displaySeconds: number, progress: number) {
    if (!countdownGauge) return;

    // カウントが0以下になったら非表示にする
    if (displaySeconds <= 0) {
        countdownGauge.clear();
        return;
    }

    let text = '';
    let color = '#FFA500';

    // 表示する秒数（小数点第一位まで）
    text = `${displaySeconds.toFixed(1)}`;

    // 色の連続的な変化（緑 → 黄 → オレンジ → 赤）
    // progressは1.0（開始）から0.0（終了）まで変化
    color = interpolateColor(progress);

    // プログレスは連続的に変化、サイズは常にmedium
    countdownGauge.draw(progress, text, color, 'medium');
}

// 色の補間関数（緑 → 赤）
function interpolateColor(progress: number): string {
    // progress: 1.0（開始/緑）→ 0.0（終了/赤）

    // RGB値を計算
    let r: number, g: number, b: number;

    if (progress > 0.66) {
        // 緑 → 黄緑（66%〜100%）
        const t = (progress - 0.66) / 0.34;
        r = Math.round(76 + (139 - 76) * (1 - t));    // 76 → 139
        g = Math.round(175 + (195 - 175) * (1 - t));  // 175 → 195
        b = Math.round(80 + (74 - 80) * (1 - t));     // 80 → 74
    } else if (progress > 0.33) {
        // 黄緑 → オレンジ（33%〜66%）
        const t = (progress - 0.33) / 0.33;
        r = Math.round(139 + (255 - 139) * (1 - t));  // 139 → 255
        g = Math.round(195 + (152 - 195) * (1 - t));  // 195 → 152
        b = Math.round(74 + (0 - 74) * (1 - t));      // 74 → 0
    } else {
        // オレンジ → 赤（0%〜33%）
        const t = progress / 0.33;
        r = 255;
        g = Math.round(152 * t);                      // 152 → 0
        b = 0;
    }

    // RGB値を16進数に変換
    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
}

// 時間表示の更新
function updateElapsedTime(seconds: number) {
    if (!elapsedTimeEl) return;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    elapsedTimeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 練習番号の更新
function updateRehearsalMark(mark: string) {
    if (rehearsalMarkEl) {
        rehearsalMarkEl.textContent = `Section: ${mark}`;
    }
}

// 現在のセクション名を更新
function updateCurrentSectionName(sectionName: string) {
    if (currentSectionNameEl) {
        currentSectionNameEl.textContent = sectionName ? `- ${sectionName}` : '';
    }
}

// 次のセクション名を更新（空の場合は非表示）
function updateNextSectionName(sectionName: string) {
    if (nextSectionNameEl) {
        nextSectionNameEl.textContent = sectionName ? `- ${sectionName}` : '';
    }

    // Nextセクション全体の表示/非表示
    if (nextSectionDisplayEl) {
        if (sectionName) {
            nextSectionDisplayEl.classList.remove('hidden');
        } else {
            nextSectionDisplayEl.classList.add('hidden');
        }
    }
}

// 初期化
console.log(`Player ${playerNumber} screen initialized`);

// デモアニメーションは一旦停止（コントローラーからの信号テスト用）
// let demoBar = 1;
// let demoSeconds = 0;

// BroadcastChannelでコントローラーから指示を受け取る
const channel = new BroadcastChannel('performance-control');

channel.onmessage = (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'metronome-pulse':
            // メトロノームパルス
            triggerMetronomePulse();
            console.log('Metronome pulse triggered');
            break;

        case 'rehearsal-mark':
            // 練習番号更新
            if (data.mark !== undefined) {
                updateRehearsalMark(data.mark);
                console.log(`Rehearsal mark updated to: ${data.mark}`);
            }
            break;

        case 'countdown':
            // カウントダウン表示
            if (data.bars !== undefined || data.beats !== undefined) {
                showCountdown(data.bars || 0, data.beats || 0);
                console.log(`Countdown: ${data.bars} bars, ${data.beats} beats`);
            }
            break;

        case 'countdown-smooth':
            // 滑らかなカウントダウン表示
            if (data.seconds !== undefined && data.displaySeconds !== undefined && data.progress !== undefined) {
                showSmoothCountdown(data.seconds, data.displaySeconds, data.progress);
            }
            break;

        case 'elapsed-time':
            // 経過時間更新
            if (data.seconds !== undefined) {
                updateElapsedTime(data.seconds);
            }
            break;

        case 'current-section':
            // 現在のセクション名更新
            if (data.name !== undefined) {
                updateCurrentSectionName(data.name);
                console.log(`Current section updated to: ${data.name}`);
            }
            break;

        case 'next-section':
            // 次のセクション名更新（空文字列で非表示）
            if (data.name !== undefined) {
                updateNextSectionName(data.name);
                console.log(`Next section updated to: ${data.name || '(hidden)'}`);
            }
            break;
    }
};

console.log('BroadcastChannel "performance-control" is ready for messages');