// import { DspManager } from "./dsp/dspManager";

// 平均律の周波数テーブル（A4=440Hz, 88鍵相当）
const A4 = 440;
const notes = Array.from({ length: 88 }, (_, i) => A4 * Math.pow(2, (i - 48) / 12));

export class PerformanceLogic {
  private intervalId: number | null = null;
  constructor(private dspManager: any) { }

  startRandomEqualDrop(periodMs = 500) {
    this.stopRandomEqualDrop();
    this.intervalId = window.setInterval(() => {
      const freq = notes[Math.floor(Math.random() * notes.length)];
      const synth = this.dspManager.getSynth(0);
      if (synth) {
        synth.setFreq(freq);
        synth.triggerDrop();
      }
    }, periodMs);
  }
  stopRandomEqualDrop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
