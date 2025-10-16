import {
  instantiateFaustModuleFromFile,
  LibFaust,
  FaustCompiler,
  FaustMonoDspGenerator,
  FaustMonoAudioWorkletNode
} from "@grame/faustwasm";
import { InputManager } from "../devices/inputManager";
import { BusManager } from './busManager';
import { LogicInput } from './logicInputs';
import { TestSignalManager } from './testSignalManager';
import { OutputRoutingManager } from './outputRoutingManager';
import { trackLifecycleManager } from './trackLifecycleManager';
import { initMusicalTimeManager, MusicalTimeManager } from '../../timing/musicalTimeManager';
import { listTracks, removeTrack } from './tracks';

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
    musicalTimeManager?: MusicalTimeManager;
    outputRoutingManager?: OutputRoutingManager;
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
  // 型の互換性問題を回避するため、一時的なバッファを作成
  const tempBuffer = new Uint8Array(dataArray.length);
  analyserNode.getByteFrequencyData(tempBuffer);
  // 元の配列にコピー
  dataArray.set(tempBuffer);
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

    // 出力ルーティング初期化 (main + monitor buses)
    if (!window.outputRoutingManager) {
      window.outputRoutingManager = new OutputRoutingManager(ctx, outputGainNode, {
        monitorCount: 3,
        meterNode: outputMeter ?? undefined
      });
    }

    // マイクルーター初期化 (エラー時も継続)
    try {
      // MicRouter を必ず初期化
      if (!inputManager.getMicRouter()) {
        inputManager.initMicRouter(ctx);
        console.log("[audioCore] MicRouter initialized");
      }

      await inputManager.setupMicInputs();
      console.log("[audioCore] MicRouter setup completed");
    } catch (error) {
      console.warn("[audioCore] MicRouter setup failed, continuing without mic input:", error);
      // エラーでもMicRouterは初期化されているので利用可能
    }

    // UI設定
    setupOutputGainControls();
    setupOutputMeterCanvas();

    // TestSignalManager 初期化
    if (!window.testSignalManager) {
      window.testSignalManager = new TestSignalManager(ctx);
    }

    // MusicalTimeManager 初期化
    if (!window.musicalTimeManager) {
      window.musicalTimeManager = initMusicalTimeManager(ctx);
      console.log("[audioCore] MusicalTimeManager initialized");
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

    // TrackLifecycleManager へ AudioContext を通知（未設定時のみ）
    try {
      // @ts-ignore private参照を避けつつ getStats 呼出しで存在確認
      (trackLifecycleManager as any);
      // 内部に既にセット済みか簡易判定（privateなので直接チェック不可。再セットは無害だがログ抑制）
      trackLifecycleManager.setAudioContext(window.audioCtx!);
      console.log('[audioCore] TrackLifecycleManager AudioContext set');
    } catch (e) {
      console.warn('[audioCore] Failed to set AudioContext on TrackLifecycleManager', e);
    }

  } catch (e) {
    const log = document.getElementById("debug-log");
    if (log) log.textContent += "ensureBaseAudio error: " + (e as Error).message + "\n";
    else console.error("ensureBaseAudio error:", e);
    throw e;
  }
}

/**
 * 既存のFaust DSPノードをクリーンアップ
 */
export function cleanupExistingDSP(): void {
  if (!window.faustNode) {
    console.log("[audioCore] No existing Faust DSP to cleanup");
    return;
  }

  try {
    console.log("[audioCore] Cleaning up existing Faust DSP node");

    // 接続を切断
    window.faustNode.disconnect();

    // Trackシステムから切り離し (もし存在すれば)
    const tracks = listTracks();
    const faustTrack = tracks.find(t => t.inputNode === window.faustNode);
    if (faustTrack) {
      console.log(`[audioCore] Removing Faust track: ${faustTrack.id}`);
      removeTrack(faustTrack.id);
    }

    // リファレンスをクリア
    window.faustNode = undefined;

    console.log("[audioCore] ✅ Faust DSP cleanup completed");
  } catch (error) {
    console.error("[audioCore] Failed to cleanup Faust DSP:", error);
  }
}

/**
 * Faust DSP 適用 (旧 initAudio の DSP 部分)
 */
export async function applyFaustDSP(): Promise<void> {
  try {
    // 既存のDSPノードをクリーンアップ
    cleanupExistingDSP();

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

    // Faust ノード接続
    // 注意: 新システムでは、MicRouterは直接出力に接続されません
    // マイク入力はPerformanceTrackManagerを通してルーティングされます
    const micRouter = inputManager.getMicRouter();
    if (micRouter) {
      console.log("[audioCore] ⚠️ MicRouter found but NOT connecting to Faust node (new track-based routing)");
      console.log("[audioCore] ℹ️ Mic inputs will route through PerformanceTrackManager instead");
    } else {
      console.log("[audioCore] MicRouter not available");
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

    // 再初期化後に既存ロジック入力のルーティング/ゲインを復元する
    const logicInputManager = (window as any).logicInputManagerInstance;
    if (logicInputManager && typeof logicInputManager.list === 'function') {
      try {
        const logicInputs: LogicInput[] = logicInputManager.list();
        logicInputs.forEach((logicInput: LogicInput) => {
          try {
            busManager.ensureInput(logicInput);
            busManager.updateLogicInput(logicInput);
          } catch (error) {
            console.warn(`[audioCore] Failed to resync Logic Input ${logicInput.id} after DSP apply`, error);
          }
        });
        console.log("[audioCore] Logic Input routing resynced after DSP apply");
      } catch (error) {
        console.warn("[audioCore] Unable to resync Logic Inputs after DSP apply:", error);
      }
    } else {
      console.log("[audioCore] LogicInputManager not available during DSP apply; skipping bus resync");
    }

    const testSignalManager = window.testSignalManager as TestSignalManager | undefined;
    if (testSignalManager && typeof testSignalManager.refreshActiveSignals === 'function') {
      try {
        testSignalManager.refreshActiveSignals();
      } catch (error) {
        console.warn('[audioCore] Failed to refresh test signals after DSP apply', error);
      }
    }

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

    // UI表示をDSPのデフォルト値に合わせる（要素が存在する場合のみ）
    const freqValue = document.getElementById("freq-value");
    const gainValue = document.getElementById("gain-value");
    if (freqValue) freqValue.textContent = "200";
    if (gainValue) gainValue.textContent = "0.5";

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