// 複数DSPの生成・管理・ルーティングを担当するマネージャークラス
// - Faustシンセ・エフェクトのインスタンス管理
// - DSPの追加・削除・切替・合成
// - ルーティングや信号フローの制御
// - 今後、外部入力やUI連携、状態保存機能も追加予定

import type { FaustMonoAudioWorkletNode } from "@grame/faustwasm";
import { FaustSynthController } from "./faustSynthController";

export class DspManager {
  private synths: FaustSynthController[] = [];
  async loadSynth(node: FaustMonoAudioWorkletNode) {
    const synth = new FaustSynthController(node);
    this.synths.push(synth);
    return synth;
  }
  getSynth(index = 0) {
    return this.synths[index];
  }
  // 今後: 複数DSP管理やルーティングもここに追加
}
