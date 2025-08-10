import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
  FaustMonoAudioWorkletNode
} from "@grame/faustwasm";
import { InputManager } from "./inputManager";
import { BusManager } from './busManager';

/* 型拡張 */
declare global {
  interface Window {
    audioCtx?: AudioContext;
    faustNode?: FaustMonoAudioWorkletNode;
    outputGainNode?: GainNode;
    masterGainValue?: number;
    inputManager?: InputManager;
    busManager?: BusManager;
  }
}

/* Audio初期化・管理 */
let outputMeter: AnalyserNode | null = null;
let outputMeterData: Uint8Array | null = null;
let outputMeterCanvas: HTMLCanvasElement | null = null;
let outputMeterCtx: CanvasRenderingContext2D | null = null;

function drawMeter(analyserNode: AnalyserNode, dataArray: Uint8Array, canvasCtx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  if (!analyserNode || !dataArray || !canvasCtx || !canvas) return;
  analyserNode.getByteFrequencyData(dataArray);
  const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
  const width = (average / 255) * canvas.width;
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  canvasCtx.fillStyle = 'green';
  canvasCtx.fillRect(0, 0, width, canvas.height);
  requestAnimationFrame(() => drawMeter(analyserNode, dataArray, canvasCtx, canvas));
}

// マスターゲイン値をwindowに保持
window.masterGainValue = 1;

function updateOutputGain() {
  const toggle = document.getElementById('toggle-audio') as HTMLInputElement | null;
  const gainNode = window.outputGainNode;
  const masterGain = window.masterGainValue ?? 1;
  if (gainNode && toggle) {
    gainNode.gain.value = toggle.checked ? masterGain : 0;
  }
}

export async function initAudio() {
  try {
    const ctx = new AudioContext();
    window.audioCtx = ctx;

    // InputManagerを初期化
    const inputManager = new InputManager();
    inputManager.initMicRouter(ctx);
    window.inputManager = inputManager;

    // 修正: publicディレクトリから直接ロード
    const faustMod = await instantiateFaustModuleFromFile("/faust/libfaust-wasm.js");
    const libFaust = new LibFaust(faustMod);
    const compiler = new FaustCompiler(libFaust);

    const dspCode = await fetch("/dsp/mysynth.dsp").then(r => r.text());
    const gen = new FaustMonoDspGenerator();
    await gen.compile(compiler, "mysynth", dspCode, "");
    if ((gen as any).load) await (gen as any).load(ctx.audioWorklet);

    const node = await gen.createNode(ctx);
    if (!node) throw new Error("AudioWorklet unsupported");

    // === ここからGainNode追加 ===
    const outputGainNode = ctx.createGain();
    outputGainNode.gain.value = 1; // 常に1で初期化
    window.outputGainNode = outputGainNode;

    outputMeter = ctx.createAnalyser();
    outputMeter.fftSize = 32;
    outputMeterData = new Uint8Array(outputMeter.frequencyBinCount);

    // マイクルーターを設定
    try {
      await inputManager.setupMicInputs();

      // マイクルーター→Faustノード→GainNode→AnalyserNode→destination
      const micRouter = inputManager.getMicRouter();
      if (micRouter) {
        micRouter.connectOutput(node);
        console.log("[audioCore] Connected MicRouter to Faust node");
      }
    } catch (error) {
      console.warn("[audioCore] MicRouter setup failed, continuing without mic input:", error);
    }

    // Faustノード→GainNode→AnalyserNode→destination
    // 旧: node.connect(outputGainNode);
    // 新: master FX チェーン経由 (effectsBus -> outputGainNode)
    window.busManager = new BusManager(ctx, outputGainNode);
    const effectsInput = window.busManager.getEffectsInputNode();
    // 旧: faustNode を直接 master effectsBus へ接続
    // node.connect(effectsInput);
    // Track 作成後に tracks.ts 側で volumeGain -> effectsInput を接続する
    effectsInput.connect(outputGainNode); // 初期は空 (後で volumeGain が追加される)
    outputGainNode.connect(outputMeter);
    outputMeter.connect(ctx.destination);
    // 追加: オーディオエンジン初期化イベント発火 (master FX キュー flush 用)
    try { document.dispatchEvent(new CustomEvent('audio-engine-initialized')); } catch { }

    outputMeterCanvas = document.getElementById('output-meter') as HTMLCanvasElement;
    if (outputMeterCanvas) outputMeterCtx = outputMeterCanvas.getContext('2d');

    if (outputMeter && outputMeterData && outputMeterCtx && outputMeterCanvas) {
      drawMeter(outputMeter, outputMeterData, outputMeterCtx, outputMeterCanvas);
    }

    // GainNodeの値をトグルスイッチの状態に合わせて再設定
    const toggleAudioCheckbox = document.getElementById("toggle-audio");
    if (toggleAudioCheckbox instanceof HTMLInputElement) {
      outputGainNode.gain.value = toggleAudioCheckbox.checked ? 1 : 0;
      console.log(`[DEBUG] initAudio: outputGainNode.gain=${outputGainNode.gain.value}`);
    } else {
      outputGainNode.gain.value = 1;
    }
    // === ここまでGainNode追加 ===

    window.faustNode = node;

    // マスターゲインスライダーの初期設定とイベントリスナー
    const masterGainSlider = document.getElementById("master-gain-slider") as HTMLInputElement | null;
    const masterGainValueDisplay = document.getElementById("master-gain-value") as HTMLSpanElement | null;

    if (masterGainSlider && masterGainValueDisplay) {
      window.masterGainValue = parseFloat(masterGainSlider.value);
      masterGainValueDisplay.textContent = masterGainSlider.value;
      masterGainSlider.addEventListener("input", () => {
        window.masterGainValue = parseFloat(masterGainSlider.value);
        masterGainValueDisplay.textContent = masterGainSlider.value;
        updateOutputGain();
      });
    }

    // トグルスイッチのイベントリスナー
    if (toggleAudioCheckbox instanceof HTMLInputElement) {
      toggleAudioCheckbox.addEventListener("change", () => {
        updateOutputGain();
      });
    }

    // 初期反映
    updateOutputGain();

    // 初期値
    document.getElementById("freq-value")!.textContent = "440";
    document.getElementById("gain-value")!.textContent = "0.25";
  } catch (e) {
    const log = document.getElementById("debug-log");
    if (log) log.textContent += "initAudio error: " + (e as Error).message + "\n";
    else console.error("initAudio error:", e);
  }
}

export function resumeAudio() {
  return window.audioCtx?.resume();
}

export function suspendAudio() {
  if (window.audioCtx && window.audioCtx.state === "running") {
    return window.audioCtx.suspend();
  }
}