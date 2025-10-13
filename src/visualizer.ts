import { VisualizerManager } from "./visualizers/visualizerManager";
import "./types/tauri.d.ts";
import { applyAuthGuard } from './auth/authGuard';

// 認証ガードを最初に適用
applyAuthGuard();

// ビジュアライザーマネージャーを初期化
const visualizerManager = new VisualizerManager();

// 必要に応じてグローバルにアクセスできるように
(window as any).visualizerManager = visualizerManager;