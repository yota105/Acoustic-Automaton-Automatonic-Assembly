import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
  FaustMonoAudioWorkletNode
} from "@grame/faustwasm";
import { InputManager } from "./inputManager";
import { BusManager } from './busManager';
import { TestSignalManager } from './testSignalManager';

/* 型拡張 */
declare global {
  interface Window {
    audioCtx?: AudioContext;
    faustNode?: FaustMonoAudioWorkletNode;
    outputGainNode?: GainNode;
    masterGainValue?: number;
    inputManager?: InputManager;
    busManager?: BusManager;
    testSignalManager?: TestSignalManager;
    // 音声接続を確実に保持するための参照
    audioConnections?: {
      synthBus?: GainNode;
      silentInput?: GainNode;
    };
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

/** 
 * Base Audio レイヤー初期化
 * DSP 非依存で AudioContext、outputGainNode、busManager を準備
 */
export async function ensureBaseAudio(): Promise<void> {
  try {
    // AudioContext 作成 (既存があれば再利用)
    if (!window.audioCtx) {
      const ctx = new AudioContext();
      window.audioCtx = ctx;
    }
    const ctx = window.audioCtx;

    // AudioContext が suspended の場合は resume
    if (ctx.state === 'suspended') {
      await ctx.resume();
      console.log("[audioCore] AudioContext resumed from suspended state");
    }

    // InputManager 初期化
    if (!window.inputManager) {
      const inputManager = new InputManager();
      inputManager.initMicRouter(ctx);
      window.inputManager = inputManager;
    }
    const inputManager = window.inputManager;

    // OutputGainNode 作成 (既存があれば再利用)
    if (!window.outputGainNode) {
      const outputGainNode = ctx.createGain();
      outputGainNode.gain.value = 1;
      window.outputGainNode = outputGainNode;
    }
    const outputGainNode = window.outputGainNode;

    // OutputMeter 作成
    if (!outputMeter) {
      outputMeter = ctx.createAnalyser();
      outputMeter.fftSize = 32;
      outputMeterData = new Uint8Array(outputMeter.frequencyBinCount);
    }

    // BusManager 初期化 (Faust非依存)
    if (!window.busManager) {
      window.busManager = new BusManager(ctx, outputGainNode);
    }

    // 基本ルーティング: outputMeter -> destination
    // Note: BusManagerのコンストラクタで各バスは既にoutputGainNodeに接続済み
    outputGainNode.connect(outputMeter);
    outputMeter.connect(ctx.destination);

    // マイクルーター初期化 (エラー時も継続)
    try {
      await inputManager.setupMicInputs();
      console.log("[audioCore] MicRouter setup completed");
    } catch (error) {
      console.warn("[audioCore] MicRouter setup failed, continuing without mic input:", error);
    }

    // UI設定
    setupOutputGainControls();
    setupOutputMeterCanvas();

    // TestSignalManager 初期化
    if (!window.testSignalManager) {
      window.testSignalManager = new TestSignalManager(ctx);
    }

    // デバッグ: 音声ルーティング状態確認
    console.log("[audioCore] Audio routing debug:");
    console.log("- AudioContext state:", ctx.state);
    console.log("- OutputGainNode:", outputGainNode);
    console.log("- OutputGainNode.gain.value:", outputGainNode.gain.value);
    console.log("- OutputMeter:", outputMeter);
    console.log("- BusManager:", window.busManager);

    // Base Audio準備完了イベント
    document.dispatchEvent(new CustomEvent('audio-base-ready'));

    // AudioContext キープアライブ（自動suspension防止）
    const keepAlive = setInterval(() => {
      if (ctx.state === 'suspended') {
        console.warn("[audioCore] AudioContext suspended, attempting resume...");
        ctx.resume().catch(err => {
          console.error("[audioCore] Failed to resume AudioContext:", err);
        });
      }
    }, 5000); // 5秒間隔でチェック

    // キープアライブ停止関数をグローバルに公開
    (window as any).stopAudioKeepAlive = () => {
      clearInterval(keepAlive);
      console.log("[audioCore] AudioContext keep-alive stopped");
    };

    console.log("[audioCore] Base Audio initialized successfully");

  } catch (e) {
    const log = document.getElementById("debug-log");
    if (log) log.textContent += "ensureBaseAudio error: " + (e as Error).message + "\n";
    else console.error("ensureBaseAudio error:", e);
    throw e;
  }
}

/**
 * Faust DSP 適用 (旧 initAudio の DSP 部分)
 */
export async function applyFaustDSP(): Promise<void> {
  try {
    // Base Audio が準備されていることを確認
    if (!window.audioCtx || !window.outputGainNode || !window.busManager) {
      await ensureBaseAudio();
    }

    const ctx = window.audioCtx!;
    const busManager = window.busManager!;
    const inputManager = window.inputManager!;

    // Faust モジュールロード
    const faustMod = await instantiateFaustModuleFromFile("/faust/libfaust-wasm.js");
    const libFaust = new LibFaust(faustMod);
    const compiler = new FaustCompiler(libFaust);

    const dspCode = await fetch("/dsp/mysynth.dsp").then(r => r.text());
    const gen = new FaustMonoDspGenerator();
    await gen.compile(compiler, "mysynth", dspCode, "");
    if ((gen as any).load) await (gen as any).load(ctx.audioWorklet);

    const node = await gen.createNode(ctx);
    if (!node) throw new Error("AudioWorklet unsupported");

    // Faust ノード接続（MicRouter接続は後回し）
    const micRouter = inputManager.getMicRouter();
    if (micRouter) {
      try {
        micRouter.connectOutput(node);
        console.log("[audioCore] Connected MicRouter to Faust node");
      } catch (error) {
        console.warn("[audioCore] Failed to connect MicRouter, continuing without mic input:", error);
      }
    } else {
      console.log("[audioCore] MicRouter not available, creating silent input for Faust");
      // MicRouterがない場合、無音の入力ソースを作成
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(node);

      // 参照を保持してガベージコレクションを防ぐ
      if (!window.audioConnections) window.audioConnections = {};
      window.audioConnections.silentInput = silentGain;
    }

    // Faust ノードを synthBus へ接続 (Track化待ちの暫定措置)
    // 注意: Trackシステムが後で接続を管理するため、ここでは接続しない
    const synthInput = busManager.getSynthInputNode();
    console.log("[audioCore] Faust node created, synthesis input available at:", synthInput);
    console.log("[audioCore] Track system will handle Faust node connection");

    // 参照を保持してガベージコレクションを防ぐ
    if (!window.audioConnections) window.audioConnections = {};
    window.audioConnections.synthBus = synthInput;

    window.faustNode = node;

    // デバッグ: Faust DSP 状態確認
    console.log("[audioCore] Faust DSP debug:");
    console.log("- Faust node:", node);
    try {
      console.log("- Node parameters:", await node.getParams?.());
    } catch (e) {
      console.log("- Node parameters: unavailable");
    }
    console.log("- MicRouter connection:", !!micRouter);
    console.log("- Synth input connection:", synthInput);
    console.log("- Faust node outputs:", node.numberOfOutputs);

    // オーディオエンジン初期化完了イベント発火 (master FX キュー flush 用)
    document.dispatchEvent(new CustomEvent('audio-engine-initialized'));

    // UI表示をDSPのデフォルト値に合わせる
    document.getElementById("freq-value")!.textContent = "200";
    document.getElementById("gain-value")!.textContent = "0.5";

    console.log("[audioCore] Faust DSP applied successfully");

  } catch (e) {
    const log = document.getElementById("debug-log");
    if (log) log.textContent += "applyFaustDSP error: " + (e as Error).message + "\n";
    else console.error("applyFaustDSP error:", e);
    throw e;
  }
}

/** UI コントロール設定 */
function setupOutputGainControls(): void {
  const toggleAudioCheckbox = document.getElementById("toggle-audio") as HTMLInputElement;
  const outputGainNode = window.outputGainNode!;

  // 初期値設定
  if (toggleAudioCheckbox) {
    outputGainNode.gain.value = toggleAudioCheckbox.checked ? 1 : 0;
  } else {
    outputGainNode.gain.value = 1;
  }

  // マスターゲインスライダー
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

  // トグルスイッチイベント
  if (toggleAudioCheckbox) {
    toggleAudioCheckbox.addEventListener("change", () => {
      updateOutputGain();
    });
  }

  // 初期反映
  updateOutputGain();
}

/** OutputMeter Canvas 設定 */
function setupOutputMeterCanvas(): void {
  outputMeterCanvas = document.getElementById('output-meter') as HTMLCanvasElement;
  if (outputMeterCanvas) outputMeterCtx = outputMeterCanvas.getContext('2d');

  if (outputMeter && outputMeterData && outputMeterCtx && outputMeterCanvas) {
    drawMeter(outputMeter, outputMeterData, outputMeterCtx, outputMeterCanvas);
  }
}

/** 
 * 従来の initAudio (後方互換)
 * 内部で ensureBaseAudio + applyFaustDSP を呼ぶ
 */
export async function initAudio(): Promise<void> {
  await ensureBaseAudio();
  await applyFaustDSP();
}

export function resumeAudio() {
  return window.audioCtx?.resume();
}

export function suspendAudio() {
  if (window.audioCtx && window.audioCtx.state === "running") {
    return window.audioCtx.suspend();
  }
}