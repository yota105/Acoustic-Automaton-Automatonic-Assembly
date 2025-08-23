import { VisualizerManager } from "./visualizers/visualizerManager";
import "./types/tauri.d.ts";

// ビジュアライザーマネージャーを初期化
const visualizerManager = new VisualizerManager();

// 必要に応じてグローバルにアクセスできるように
(window as any).visualizerManager = visualizerManager;