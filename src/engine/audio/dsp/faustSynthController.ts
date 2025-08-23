// Faustシンセ用コントローラークラス
// - Faustノードの生成・初期化
// - パラメータ操作（例: setFreq, setGain, triggerDrop など）
// - 状態管理（必要に応じて）
// - 今後、複数シンセや拡張パラメータ対応も追加予定

import type { FaustMonoAudioWorkletNode } from "@grame/faustwasm";

export class FaustSynthController {
  private node: FaustMonoAudioWorkletNode;
  constructor(node: FaustMonoAudioWorkletNode) {
    this.node = node;
  }
  setFreq(value: number) {
    this.node.setParamValue("/mysynth/freq", value);
  }
  triggerDrop() {
    this.node.setParamValue("/mysynth/drop", 1);
    setTimeout(() => this.node.setParamValue("/mysynth/drop", 0), 30);
  }
}
