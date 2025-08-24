/**
 * 持続音管理システム
 * 検出された音やボタンによる電子音を持続音として管理
 */

export interface SustainedTone {
  id: string;
  frequency: number;
  amplitude: number;
  startTime: number;
  instrument: string;
  type: 'acoustic' | 'electronic';
  audioNode: AudioNode;
  gainNode: GainNode;
  oscillator?: OscillatorNode;
  isActive: boolean;
}

export interface SustainedToneConfig {
  maxInstances: number;     // 最大インスタンス数
  fadeOutTime: number;      // フェードアウト時間 (秒)
  sustainLevel: number;     // サスティンレベル (0-1)
  reverbAmount: number;     // リバーブ量 (0-1)
  defaultDurationSec: number; // 自動解放までの基本持続秒数 (<=0 で無制限)
  harmonicRichness: number; // 倍音数 (1=基本, 2..5 くらい)
}

export class SustainedToneManager {
  private config: SustainedToneConfig;
  private activeTones: Map<string, SustainedTone>;
  private audioContext: AudioContext;
  private outputGainNode: GainNode;
  private reverbNode: ConvolverNode | null = null;
  private callbacks: {
    onToneAdded?: (tone: SustainedTone) => void;
    onToneRemoved?: (toneId: string) => void;
    onMaxInstancesReached?: () => void;
  } = {};

  constructor(audioContext: AudioContext, outputNode: AudioNode, config: Partial<SustainedToneConfig> = {}) {
    this.audioContext = audioContext;
    this.config = {
      maxInstances: 10,
      fadeOutTime: 2.0,
      sustainLevel: 0.8,
      reverbAmount: 0.3,
      defaultDurationSec: 6.0,
      harmonicRichness: 3,
      ...config
    };
    this.activeTones = new Map();

    // 出力ゲインノードを作成
    this.outputGainNode = audioContext.createGain();
    this.outputGainNode.gain.value = 0.7;
    this.outputGainNode.connect(outputNode);

    // 簡易リバーブの設定（後でFaustリバーブに置き換え可能）
    this.setupSimpleReverb();

    console.log('[SustainedToneManager] Initialized');
  }

  /**
   * 簡易リバーブセットアップ
   */
  private setupSimpleReverb(): void {
    try {
      // 簡易的なインパルスレスポンスを生成
      const length = this.audioContext.sampleRate * 2; // 2秒
      const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
      }

      this.reverbNode = this.audioContext.createConvolver();
      this.reverbNode.buffer = impulse;
      console.log('[SustainedToneManager] Simple reverb created');
    } catch (error) {
      console.warn('[SustainedToneManager] Failed to create reverb:', error);
    }
  }

  /**
   * 新しい持続音を追加
   */
  addTone(frequency: number, instrument: string, amplitude: number = 0.5, type: 'acoustic' | 'electronic' = 'acoustic'): string {
    // 最大インスタンス数チェック
    if (this.activeTones.size >= this.config.maxInstances) {
      this.removeOldestTone();
      if (this.callbacks.onMaxInstancesReached) {
        this.callbacks.onMaxInstancesReached();
      }
    }

    const id = `tone_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const tone = this.createTone(id, frequency, instrument, amplitude, type);
      this.activeTones.set(id, tone);

      console.log(`[SustainedToneManager] Added ${type} tone: ${instrument} @ ${frequency.toFixed(2)}Hz`);

      if (this.callbacks.onToneAdded) {
        this.callbacks.onToneAdded(tone);
      }

      return id;
    } catch (error) {
      console.error('[SustainedToneManager] Failed to create tone:', error);
      return '';
    }
  }

  /**
   * 音の生成
   */
  private createTone(id: string, frequency: number, instrument: string, amplitude: number, type: 'acoustic' | 'electronic'): SustainedTone {
    // メインゲイン
    const gainNode = this.audioContext.createGain();
    const dryGainNode = this.audioContext.createGain();
    const wetGainNode = this.audioContext.createGain();

    const now = this.audioContext.currentTime;

    // 倍音合成 (acoustic の場合のみ複数オシレーター)
    const oscillators: OscillatorNode[] = [];
    const harmonicCount = type === 'acoustic' ? Math.max(1, Math.min(8, this.config.harmonicRichness)) : 1;
    for (let h = 1; h <= harmonicCount; h++) {
      const osc = this.audioContext.createOscillator();
      const partialGain = this.audioContext.createGain();
      const partialAmp = (1 / h) * (type === 'electronic' ? 1 : 0.9); // 減衰
      osc.frequency.setValueAtTime(frequency * h, now);
      osc.type = type === 'electronic' ? 'sine' : (h === 1 ? 'triangle' : 'sine');
      partialGain.gain.value = partialAmp;
      osc.connect(partialGain).connect(gainNode);
      osc.start(now);
      oscillators.push(osc);
    }

    // エンベロープ (少し長めのアタック/ディケイ)
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(amplitude, now + 0.25); // Attack
    gainNode.gain.linearRampToValueAtTime(amplitude * this.config.sustainLevel, now + 1.0); // Decay→Sustain

    // 簡易ビブラート (acoustic のみ)
    if (type === 'acoustic') {
      try {
        const lfo = this.audioContext.createOscillator();
        const lfoGain = this.audioContext.createGain();
        lfo.frequency.value = 5.2; // 5 Hz 程度
        lfoGain.gain.value = frequency * 0.003; // 0.3% 変動
        lfo.connect(lfoGain);
        oscillators[0].frequency.cancelScheduledValues(now);
        lfoGain.connect(oscillators[0].frequency);
        lfo.start(now);
      } catch (e) {
        // オプショナル
      }
    }

    // ドライ/ウェット
    dryGainNode.gain.value = 1 - this.config.reverbAmount;
    wetGainNode.gain.value = this.config.reverbAmount;
    gainNode.connect(dryGainNode);
    gainNode.connect(wetGainNode);
    dryGainNode.connect(this.outputGainNode);
    if (this.reverbNode) {
      wetGainNode.connect(this.reverbNode);
      this.reverbNode.connect(this.outputGainNode);
    } else {
      wetGainNode.connect(this.outputGainNode);
    }

    const tone: SustainedTone = {
      id,
      frequency,
      amplitude,
      startTime: Date.now(),
      instrument,
      type,
      audioNode: gainNode,
      gainNode,
      oscillator: oscillators[0],
      isActive: true
    };

    // 自動解放スケジュール
    if (this.config.defaultDurationSec > 0) {
      const totalDur = this.config.defaultDurationSec;
      setTimeout(() => {
        if (tone.isActive) {
          this.removeTone(id, true);
        }
      }, totalDur * 1000);
    }

    return tone;
  }

  /**
   * 持続音を削除
   */
  removeTone(id: string, fadeOut: boolean = true): void {
    const tone = this.activeTones.get(id);
    if (!tone) return;

    if (fadeOut && tone.isActive) {
      // フェードアウト
      const now = this.audioContext.currentTime;
      tone.gainNode.gain.linearRampToValueAtTime(0, now + this.config.fadeOutTime);

      // フェードアウト後に完全削除
      setTimeout(() => {
        this.forceRemoveTone(id);
      }, this.config.fadeOutTime * 1000 + 100);

      tone.isActive = false;
    } else {
      this.forceRemoveTone(id);
    }

    console.log(`[SustainedToneManager] Removing tone: ${id}`);
  }

  /**
   * 強制的に音を削除
   */
  private forceRemoveTone(id: string): void {
    const tone = this.activeTones.get(id);
    if (!tone) return;

    try {
      if (tone.oscillator) {
        tone.oscillator.stop();
        tone.oscillator.disconnect();
      }
      tone.gainNode.disconnect();
      tone.audioNode.disconnect();
    } catch (error) {
      console.warn('[SustainedToneManager] Error disconnecting tone:', error);
    }

    this.activeTones.delete(id);

    if (this.callbacks.onToneRemoved) {
      this.callbacks.onToneRemoved(id);
    }
  }

  /**
   * 最も古い音を削除
   */
  private removeOldestTone(): void {
    if (this.activeTones.size === 0) return;

    let oldestId = '';
    let oldestTime = Infinity;

    for (const [id, tone] of this.activeTones) {
      if (tone.startTime < oldestTime) {
        oldestTime = tone.startTime;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.removeTone(oldestId, true);
    }
  }

  /**
   * 全ての音を削除
   */
  removeAllTones(fadeOut: boolean = true): void {
    const toneIds = Array.from(this.activeTones.keys());
    toneIds.forEach(id => this.removeTone(id, fadeOut));
  }

  /**
   * 特定楽器の音を削除
   */
  removeTonesFromInstrument(instrument: string, fadeOut: boolean = true): void {
    for (const [id, tone] of this.activeTones) {
      if (tone.instrument === instrument) {
        this.removeTone(id, fadeOut);
      }
    }
  }

  /**
   * 最大インスタンス数を設定
   */
  setMaxInstances(count: number): void {
    const newMax = Math.max(1, Math.min(20, count));
    this.config.maxInstances = newMax;

    // 現在のインスタンス数が上限を超えている場合は削除
    while (this.activeTones.size > newMax) {
      this.removeOldestTone();
    }

    console.log(`[SustainedToneManager] Max instances set to: ${newMax}`);
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<SustainedToneConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[SustainedToneManager] Config updated:', this.config);
  }

  /**
   * アクティブな音のリストを取得
   */
  getAllTones(): SustainedTone[] {
    return Array.from(this.activeTones.values());
  }

  /**
   * アクティブな音の数を取得
   */
  getActiveTonesCount(): number {
    return this.activeTones.size;
  }

  /**
   * 特定の音を取得
   */
  getTone(id: string): SustainedTone | undefined {
    return this.activeTones.get(id);
  }

  /**
   * コールバック設定
   */
  setCallbacks(callbacks: {
    onToneAdded?: (tone: SustainedTone) => void;
    onToneRemoved?: (toneId: string) => void;
    onMaxInstancesReached?: () => void;
  }): void {
    this.callbacks = callbacks;
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): SustainedToneConfig {
    return { ...this.config };
  }

  /**
   * リソース解放
   */
  dispose(): void {
    this.removeAllTones(false);
    this.outputGainNode.disconnect();
    if (this.reverbNode) {
      this.reverbNode.disconnect();
    }
    this.activeTones.clear();
    console.log('[SustainedToneManager] Disposed');
  }
}
