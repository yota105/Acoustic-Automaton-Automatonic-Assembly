import { ensureBaseAudio, applyFaustDSP, resumeAudio, suspendAudio } from "./engine/audio/core/audioCore";
import { createTrackEnvironment, listTracks } from "./engine/audio/core/tracks";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import "./types/tauri.d.ts";
import { scanAndRegisterDSPFiles } from './engine/audio/effects/effectRegistry';
import { OUTPUT_ROUTING_CHANGED_EVENT, OutputAssignment, OutputRoutingManager, OutputTarget } from './engine/audio/core/outputRoutingManager';
import './phase1TestFunctions';
import {
  runAllMusicalTimeTestsWithInit,
  testFullPerformanceWithInit,
  setupMusicalTimeManagerHelpers
} from './musicalTimeTests';
import { testCommands } from './audio/testCommands';
import { createSimpleTestUI } from './simpleMessageSender';
import { setupAudioControlPanels } from './ui/audioControlPanels';
import { applyAuthGuard } from './auth/authGuard';
import { setupPlayerScreenTestControls } from './playerScreenTestControls';
import type { ViewportCropConfig } from './visualizers/viewportTypes';

// 認証ガードを最初に適用
applyAuthGuard();

/* デバッグ用: 初期化・状態表示 */
function logStatus(msg: string) {
  const log = document.getElementById("debug-log");
  if (log) log.textContent += msg + "\n";
  else console.log(msg);
}

// Check if running in Tauri environment
function isTauriEnvironment(): boolean {
  try {
    getCurrentWindow();
    return true;
  } catch {
    return false;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await setupAudioControlPanels({ enqueueMasterFx });

  logStatus("DOMContentLoaded");  // === Visualizer display control logic - TAURI WINDOW VERSION ===
  logStatus("[DEBUG] Starting Visualizer setup...");
  const visualizerIds = ["visualizer1", "visualizer2", "visualizer3"];
  logStatus(`[DEBUG] Visualizer IDs: ${visualizerIds.join(", ")}`);
  const visualizerWindows: { [key: string]: any } = {};
  const isTauriEnv = isTauriEnvironment();
  logStatus(`[DEBUG] Tauri environment: ${isTauriEnv}`);
  if (!isTauriEnv) {
    logStatus("[WARNING] Tauri API not available. Running in browser fallback mode.");
  } else {
    logStatus("[DEBUG] Tauri API detected. Using native window management.");
  }

  visualizerIds.forEach(id => {
    logStatus(`[DEBUG] Setting up visualizer checkbox for ${id}`);

    const checkbox = document.getElementById(`show-${id}`) as HTMLInputElement | null;
    if (!checkbox) {
      logStatus(`[ERROR] Checkbox for ${id} not found!`);
      return;
    }
    checkbox.addEventListener("change", async (event) => {
      // 以前: event.preventDefault(); を削除（チェック状態がブラウザ側で確定しないケース回避）
      const isChecked = (event.target as HTMLInputElement).checked;
      logStatus(`[DEBUG] ${id} checkbox event fired. checked=${isChecked}`);

      if (isChecked) {
        if (isTauriEnv) {
          try {
            // Tauriウィンドウを作成
            const windowLabel = `${id}-window`;

            // 既存のウィンドウをクリーンアップ
            if (visualizerWindows[id]) {
              try {
                await visualizerWindows[id].close();
              } catch (e) {
                // 既に閉じられている場合は無視
              }
              visualizerWindows[id] = null;
            }

            visualizerWindows[id] = new WebviewWindow(windowLabel, {
              url: 'src/visualizer.html',
              title: `Visualizer ${id.slice(-1)}`,
              width: 800,
              height: 600,
              resizable: true,
              decorations: true,
              center: false,
              x: 100 + (parseInt(id.slice(-1)) - 1) * 50,
              y: 100 + (parseInt(id.slice(-1)) - 1) * 50
            }); logStatus(`[DEBUG] ${id} Tauri window creation initiated`);

            // ウィンドウ作成成功のイベントをリッスン
            visualizerWindows[id].once('tauri://created', () => {
              checkbox.checked = true;
              logStatus(`[DEBUG] ${id} Tauri window created and shown successfully`);
            });

            // ウィンドウ作成エラーのイベントをリッスン
            visualizerWindows[id].once('tauri://error', (error: any) => {
              logStatus(`[ERROR] ${id} Tauri window error: ${JSON.stringify(error)}`);
              checkbox.checked = false;
              visualizerWindows[id] = null;
            });

            // ウィンドウが閉じられた時の処理をリッスン
            await visualizerWindows[id].onCloseRequested(() => {
              checkbox.checked = false;
              visualizerWindows[id] = null;
              logStatus(`[DEBUG] ${id} Tauri window was closed`);
            });

          } catch (error) {
            logStatus(`[ERROR] Failed to create ${id} Tauri window: ${(error as Error).message}`);
            checkbox.checked = false;
            visualizerWindows[id] = null;
          }
        } else {
          // フォールバック: ブラウザモード
          const windowFeatures = "width=800,height=600,scrollbars=no,resizable=yes,menubar=no,toolbar=no";
          visualizerWindows[id] = window.open("visualizer.html", `${id}-window`, windowFeatures);

          if (visualizerWindows[id]) {
            logStatus(`[DEBUG] ${id} fallback window opened successfully`);
            checkbox.checked = true;

            // ポーリングでウィンドウの状態をチェック
            const checkClosed = setInterval(() => {
              if (visualizerWindows[id] && visualizerWindows[id].closed) {
                checkbox.checked = false;
                visualizerWindows[id] = null;
                clearInterval(checkClosed);
                logStatus(`[DEBUG] ${id} fallback window was closed`);
              }
            }, 1000);
          } else {
            logStatus(`[ERROR] Failed to open ${id} fallback window - popup blocked?`);
            checkbox.checked = false;
          }
        }
      } else {
        // ウィンドウを閉じる
        if (visualizerWindows[id]) {
          try {
            if (isTauriEnv && visualizerWindows[id].close) {
              await visualizerWindows[id].close();
            } else if (visualizerWindows[id].close && !visualizerWindows[id].closed) {
              visualizerWindows[id].close();
            }
            visualizerWindows[id] = null;
            logStatus(`[DEBUG] ${id} window closed`);
          } catch (error) {
            logStatus(`[ERROR] Failed to close ${id} window: ${(error as Error).message}`);
          }
        }
        checkbox.checked = false;
      }
    });
    // 初期状態を設定
    checkbox.checked = false;
    logStatus(`[DEBUG] ${id} initial: checkbox=${checkbox.checked}`);
  });// === Visualizer Controls - Send commands to visualizer windows (Tauri + fallback) ===
  const sendToVisualizers = async (message: any) => {
    logStatus(`[DEBUG] Attempting to send message: ${JSON.stringify(message)}`);

    for (const id of visualizerIds) {
      const visualizerWindow = visualizerWindows[id];
      if (!visualizerWindow) {
        logStatus(`[DEBUG] Skipping ${id}: window not open`);
        continue;
      }

      try {
        if (isTauriEnv && visualizerWindow.emit) {
          // Tauriウィンドウの場合はemitを使用
          await visualizerWindow.emit('visualizer-command', message);
          logStatus(`[DEBUG] Message emitted to ${id}: ${JSON.stringify(message)}`);
        } else if (visualizerWindow.postMessage && !visualizerWindow.closed) {
          // フォールバック: ブラウザウィンドウの場合はpostMessageを使用
          visualizerWindow.postMessage(message, "*");
          logStatus(`[DEBUG] Message posted to ${id}: ${JSON.stringify(message)}`);
        } else {
          logStatus(`[DEBUG] Skipping ${id}: window not available or closed`);
        }
      } catch (e) {
        logStatus(`[ERROR] Failed to send message to ${id}: ${(e as Error).message}`);
      }
    }
  };
  // 特定のVisualizerにのみメッセージを送信する関数（将来の機能拡張用）
  // const sendToSpecificVisualizer = async (visualizerId: string, message: any) => {
  //   const visualizerWindow = visualizerWindows[visualizerId];
  //   if (!visualizerWindow) {
  //     logStatus(`[DEBUG] ${visualizerId} window not open`);
  //     return;
  //   }
  //   
  //   try {
  //     if (isTauriEnv && visualizerWindow.emit) {
  //       await visualizerWindow.emit('visualizer-command', message);
  //       logStatus(`[DEBUG] Message emitted to ${visualizerId}: ${JSON.stringify(message)}`);
  //     } else if (visualizerWindow.postMessage && !visualizerWindow.closed) {
  //       visualizerWindow.postMessage(message, "*");
  //       logStatus(`[DEBUG] Message posted to ${visualizerId}: ${JSON.stringify(message)}`);
  //     }
  //   } catch (e) {
  //     logStatus(`[ERROR] Failed to send message to ${visualizerId}: ${(e as Error).message}`);
  //   }
  // };

  // ウィンドウ状態の監視とログ出力
  const monitorWindowStates = async () => {
    for (const id of visualizerIds) {
      const visualizerWindow = visualizerWindows[id];
      if (!visualizerWindow || !isTauriEnv) continue;

      try {
        if (visualizerWindow.isVisible && visualizerWindow.isMaximized) {
          const isVisible = await visualizerWindow.isVisible();
          const isMaximized = await visualizerWindow.isMaximized();
          const isMinimized = await visualizerWindow.isMinimized();
          logStatus(`[STATUS] ${id}: visible=${isVisible}, maximized=${isMaximized}, minimized=${isMinimized}`);
        }
      } catch (e) {
        // ウィンドウが閉じられている場合など
      }
    }
  };

  // 5秒ごとにウィンドウ状態をログ出力（デバッグ用）
  setInterval(monitorWindowStates, 5000);

  logStatus("[DEBUG] Visualizer setup complete, setting up display mode selector...");
  const displayModeSelector = document.getElementById("visualizer-display-mode") as HTMLSelectElement | null;
  if (!displayModeSelector) {
    logStatus("[ERROR] displayModeSelector not found!");
  } if (displayModeSelector) {
    displayModeSelector.addEventListener("change", async () => {
      logStatus(`[DEBUG] Display mode changed: ${displayModeSelector.value}`);
      if (displayModeSelector.value === "fullscreen") {
        await sendToVisualizers({ type: "fullscreen" });
      } else {
        await sendToVisualizers({ type: "normal" });
      }
    });
  } logStatus("[DEBUG] All Visualizer setup finished!");
  // Visualizer window control buttons
  const toggleVisualizerBtn = document.getElementById("toggle-visualizer") as HTMLButtonElement | null;
  if (toggleVisualizerBtn) {
    toggleVisualizerBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "toggle-visibility" });
    });
  }

  const toggleDecorationsBtn = document.getElementById("toggle-decorations") as HTMLButtonElement | null;
  if (toggleDecorationsBtn) {
    toggleDecorationsBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "toggle-border" });
    });
  }

  const maximizeVisualizerBtn = document.getElementById("maximize-visualizer") as HTMLButtonElement | null;
  if (maximizeVisualizerBtn) {
    maximizeVisualizerBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "toggle-maximize" });
    });
  }

  const fullscreenVisualizerBtn = document.getElementById("fullscreen-visualizer") as HTMLButtonElement | null;
  if (fullscreenVisualizerBtn) {
    fullscreenVisualizerBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "fullscreen" });
    });
  }
  const borderlessMaximizeBtn = document.getElementById("borderless-maximize") as HTMLButtonElement | null;
  if (borderlessMaximizeBtn) {
    borderlessMaximizeBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "borderless-maximize" });
    });
  }

  // 新しいウィンドウ制御ボタン
  const minimizeVisualizerBtn = document.getElementById("minimize-visualizer") as HTMLButtonElement | null;
  if (minimizeVisualizerBtn) {
    minimizeVisualizerBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "minimize" });
    });
  }

  const restoreVisualizerBtn = document.getElementById("restore-visualizer") as HTMLButtonElement | null;
  if (restoreVisualizerBtn) {
    restoreVisualizerBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "restore-normal" });
    });
  }

  const centerVisualizerBtn = document.getElementById("center-visualizer") as HTMLButtonElement | null;
  if (centerVisualizerBtn) {
    centerVisualizerBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "center" });
    });
  }

  const alwaysOnTopBtn = document.getElementById("always-on-top") as HTMLButtonElement | null;
  if (alwaysOnTopBtn) {
    alwaysOnTopBtn.addEventListener("click", async () => {
      await sendToVisualizers({ type: "toggle-always-on-top" });
    });
  }// Visualizer size selector
  const sizeSelector = document.getElementById("size-selector") as HTMLSelectElement | null;
  if (sizeSelector) {
    sizeSelector.addEventListener("change", async () => {
      const selectedSize = sizeSelector.value;
      let width = 800, height = 600;

      switch (selectedSize) {
        case "small":
          width = 400; height = 300;
          break;
        case "medium":
          width = 800; height = 600;
          break;
        case "large":
          width = 1200; height = 900;
          break;
        case "fullscreen":
          await sendToVisualizers({ type: "maximize" });
          return;
      }

      // Resize visualizer windows
      for (const id of visualizerIds) {
        const visualizerWindow = visualizerWindows[id];
        if (!visualizerWindow) continue;

        try {
          if (isTauriEnv && visualizerWindow.setSize) {
            // Tauriウィンドウの場合
            await visualizerWindow.setSize({ width, height });
            logStatus(`[DEBUG] Resized ${id} Tauri window to ${width}x${height}`);
          } else if (visualizerWindow.resizeTo && !visualizerWindow.closed) {
            // フォールバック: ブラウザウィンドウの場合
            visualizerWindow.resizeTo(width, height);
            logStatus(`[DEBUG] Resized ${id} fallback window to ${width}x${height}`);
          }
        } catch (error) {
          logStatus(`[ERROR] Failed to resize ${id} window: ${(error as Error).message}`);
        }
      }

      // Also send resize message to visualizer content
      await sendToVisualizers({ type: "resize", width: `${width}px`, height: `${height}px` });
    });
  }

  // === Projection crop controls ===
  const cropEnabledInput = document.getElementById('crop-enabled') as HTMLInputElement | null;
  const cropFrameInput = document.getElementById('crop-show-frame') as HTMLInputElement | null;
  const cropLeftInput = document.getElementById('crop-left') as HTMLInputElement | null;
  const cropTopInput = document.getElementById('crop-top') as HTMLInputElement | null;
  const cropRightInput = document.getElementById('crop-right') as HTMLInputElement | null;
  const cropBottomInput = document.getElementById('crop-bottom') as HTMLInputElement | null;
  const cropFrameColorInput = document.getElementById('crop-frame-color') as HTMLInputElement | null;
  const cropFrameWidthInput = document.getElementById('crop-frame-width') as HTMLInputElement | null;
  const cropScaleModeSelect = document.getElementById('crop-scale-mode') as HTMLSelectElement | null;
  const cropAnchorSelect = document.getElementById('crop-anchor') as HTMLSelectElement | null;
  const applyCropButton = document.getElementById('apply-crop') as HTMLButtonElement | null;
  const resetCropButton = document.getElementById('reset-crop') as HTMLButtonElement | null;

  const controllerCropStorageKey = 'controller:visualizer-crop-config';
  const cropDefaults: ViewportCropConfig = {
    enabled: false,
    left: 0,
    top: 0,
    right: 1,
    bottom: 1,
    frameVisible: true,
    frameColor: '#ffffff',
    frameWidth: 4,
    scaleMode: 'contain',
    anchor: 'center'
  };

  function clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function normalizePercentInput(input: HTMLInputElement): number {
    const percent = clamp(parseFloat(input.value), 0, 100);
    input.value = percent.toFixed(1).replace(/\.0$/, '');
    return percent / 100;
  }

  function setPercentInput(input: HTMLInputElement, normalized: number): void {
    const percent = clamp(normalized * 100, 0, 100);
    input.value = percent.toFixed(1).replace(/\.0$/, '');
  }

  function readCropInputs(): ViewportCropConfig | null {
    if (!cropLeftInput || !cropTopInput || !cropRightInput || !cropBottomInput || !cropEnabledInput || !cropFrameInput || !cropFrameColorInput || !cropFrameWidthInput || !cropScaleModeSelect || !cropAnchorSelect) {
      return null;
    }

    let left = normalizePercentInput(cropLeftInput);
    let top = normalizePercentInput(cropTopInput);
    let right = normalizePercentInput(cropRightInput);
    let bottom = normalizePercentInput(cropBottomInput);

    if (right <= left) {
      right = clamp(left + 0.05, 0, 1);
      setPercentInput(cropRightInput, right);
    }
    if (bottom <= top) {
      bottom = clamp(top + 0.05, 0, 1);
      setPercentInput(cropBottomInput, bottom);
    }

    const frameWidth = clamp(parseFloat(cropFrameWidthInput.value), 0, 100);
    cropFrameWidthInput.value = frameWidth.toFixed(0);

    const scaleMode = cropScaleModeSelect.value === 'cover' ? 'cover' : 'contain';
    const anchor = cropAnchorSelect.value === 'top-left' ? 'top-left' : 'center';

    return {
      enabled: cropEnabledInput.checked,
      left,
      top,
      right,
      bottom,
      frameVisible: cropFrameInput.checked,
      frameColor: cropFrameColorInput.value || '#ffffff',
      frameWidth,
      scaleMode,
      anchor
    };
  }

  function pushCropToInputs(config: ViewportCropConfig): void {
    if (!cropLeftInput || !cropTopInput || !cropRightInput || !cropBottomInput || !cropEnabledInput || !cropFrameInput || !cropFrameColorInput || !cropFrameWidthInput || !cropScaleModeSelect || !cropAnchorSelect) {
      return;
    }
    cropEnabledInput.checked = config.enabled;
    cropFrameInput.checked = !!config.frameVisible;
    setPercentInput(cropLeftInput, config.left);
    setPercentInput(cropTopInput, config.top);
    setPercentInput(cropRightInput, config.right);
    setPercentInput(cropBottomInput, config.bottom);
    cropFrameColorInput.value = config.frameColor ?? '#ffffff';
    cropFrameWidthInput.value = (config.frameWidth ?? 4).toString();
    cropScaleModeSelect.value = config.scaleMode ?? 'contain';
    cropAnchorSelect.value = config.anchor ?? 'center';
  }

  async function applyCropConfig(config: ViewportCropConfig, persist: boolean = true): Promise<void> {
    await sendToVisualizers({
      type: 'set-viewport-crop',
      config
    });

    if (persist) {
      try {
        localStorage.setItem(controllerCropStorageKey, JSON.stringify(config));
      } catch (error) {
        console.warn('[Controller] Failed to persist crop config', error);
      }
    }
  }

  function loadStoredCrop(): ViewportCropConfig {
    try {
      const stored = localStorage.getItem(controllerCropStorageKey);
      if (!stored) return { ...cropDefaults };
      const parsed = JSON.parse(stored) as Partial<ViewportCropConfig> | null;
      if (!parsed) return { ...cropDefaults };
      return {
        ...cropDefaults,
        ...parsed,
        left: clamp(parsed.left ?? cropDefaults.left, 0, 1),
        top: clamp(parsed.top ?? cropDefaults.top, 0, 1),
        right: clamp(parsed.right ?? cropDefaults.right, 0, 1),
        bottom: clamp(parsed.bottom ?? cropDefaults.bottom, 0, 1),
        frameWidth: clamp(parsed.frameWidth ?? cropDefaults.frameWidth!, 0, 100)
      };
    } catch {
      return { ...cropDefaults };
    }
  }

  if (cropEnabledInput && cropFrameInput && cropLeftInput && cropTopInput && cropRightInput && cropBottomInput && cropFrameColorInput && cropFrameWidthInput && cropScaleModeSelect && cropAnchorSelect && applyCropButton && resetCropButton) {
    const initialCropConfig = loadStoredCrop();
    pushCropToInputs(initialCropConfig);
    await applyCropConfig(initialCropConfig, false);

    const updateFromInputs = async (persist: boolean = true) => {
      const config = readCropInputs();
      if (!config) return;
      await applyCropConfig(config, persist);
    };

    applyCropButton.addEventListener('click', async () => {
      await updateFromInputs();
    });

    cropEnabledInput.addEventListener('change', async () => {
      await updateFromInputs();
    });

    cropFrameInput.addEventListener('change', async () => {
      await updateFromInputs();
    });

    [cropLeftInput, cropTopInput, cropRightInput, cropBottomInput, cropFrameColorInput, cropFrameWidthInput, cropScaleModeSelect, cropAnchorSelect].forEach((el) => {
      el.addEventListener('change', async () => {
        await updateFromInputs();
      });
    });

    resetCropButton.addEventListener('click', async () => {
      pushCropToInputs(cropDefaults);
      await applyCropConfig({ ...cropDefaults });
    });
  }

  // Device permission request before getting device list
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    logStatus("Microphone permission denied: " + (e as Error).message);
  }

  const mainOutputSelect = document.getElementById("main-output-device") as HTMLSelectElement | null;
  const monitorSelects = ["monitor1-device", "monitor2-device", "monitor3-device"].map(id => document.getElementById(id) as HTMLSelectElement | null);
  const outputAssignmentPanel = document.getElementById("output-assignment-panel") as HTMLDivElement | null;

  function getRoutingManager(): OutputRoutingManager | undefined {
    return (window as any).outputRoutingManager as OutputRoutingManager | undefined;
  }

  const sinkIdSupported = typeof HTMLAudioElement !== "undefined" && typeof (HTMLAudioElement.prototype as any).setSinkId === "function";
  let latestOutputDevices: MediaDeviceInfo[] = [];

  function rebuildOutputOptions(select: HTMLSelectElement | null, devices: MediaDeviceInfo[], config: { defaultLabel: string; includeDisabled?: boolean }) {
    if (!select) return;
    const previous = select.value || 'default';
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "default";
    defaultOption.textContent = config.defaultLabel;
    select.appendChild(defaultOption);

    if (config.includeDisabled) {
      const disabledOption = document.createElement("option");
      disabledOption.value = "disabled";
      disabledOption.textContent = "Disabled";
      select.appendChild(disabledOption);
    }

    devices.filter(d => d.kind === "audiooutput").forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Output Device (${d.deviceId})`;
      select.appendChild(opt);
    });

    const availableValues = new Set(Array.from(select.options).map(opt => opt.value));
    select.value = availableValues.has(previous) ? previous : "default";
  }

  function syncOutputSelections(assignments?: OutputAssignment[]) {
    const manager = getRoutingManager();
    const data = assignments ?? manager?.getAssignments() ?? [];

    data.forEach(assign => {
      let value: string;
      switch (assign.state) {
        case 'custom':
          value = assign.deviceId ?? 'default';
          break;
        case 'disabled':
          value = 'disabled';
          break;
        default:
          value = 'default';
          break;
      }

      if (assign.state === 'error') {
        value = 'default';
      }

      if (assign.target === 'main') {
        if (mainOutputSelect && Array.from(mainOutputSelect.options).some(opt => opt.value === value)) {
          mainOutputSelect.value = value;
        }
      } else {
        const idx = parseInt(assign.target.replace('monitor', ''), 10) - 1;
        const select = monitorSelects[idx];
        if (select && Array.from(select.options).some(opt => opt.value === value)) {
          select.value = value;
        }
      }
    });
  }

  function resolveOutputLabel(deviceId: string | null | undefined): string {
    if (!deviceId || deviceId === "default") return "System Default";
    const match = latestOutputDevices.find(d => d.deviceId === deviceId);
    if (match) return match.label || `Output Device (${match.deviceId.slice(0, 8)}…)`;
    return `Unavailable (${(deviceId ?? "").slice(0, 8)})`;
  }

  function renderOutputAssignmentPanel(assignments?: OutputAssignment[]) {
    if (!outputAssignmentPanel) return;
    const manager = getRoutingManager();
    const data = assignments ?? manager?.getAssignments() ?? [];

    if (!manager) {
      outputAssignmentPanel.innerHTML = '<div style="font-weight:600;margin-bottom:6px;">Output Assignments</div><div style="font-size:11px;color:#666;">Audio engine not initialized yet.</div>';
      return;
    }

    if (!data.length) {
      outputAssignmentPanel.innerHTML = '<div style="font-weight:600;margin-bottom:6px;">Output Assignments</div><div style="font-size:11px;color:#666;">Outputs will appear once the audio engine is ready.</div>';
      return;
    }

    const rows = data.map(assign => {
      const stateLabel = assign.state === "custom"
        ? resolveOutputLabel(assign.deviceId)
        : assign.state === "disabled"
          ? "Disabled"
          : assign.state === "error"
            ? `Error: ${assign.error ?? "unknown"}`
            : "System Default";

      const color = assign.state === "error" ? "#c0392b" : assign.state === "disabled" ? "#888" : "#333";

      return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;">
        <span style="font-weight:600;font-size:12px;">${assign.label}</span>
        <span style="font-size:11px;color:${color};text-align:right;">${stateLabel}</span>
      </div>`;
    }).join("");

    const footer = sinkIdSupported
      ? '<div style="font-size:10px;color:#666;margin-top:6px;">Use the selectors above to route each bus.</div>'
      : '<div style="font-size:10px;color:#c0392b;margin-top:6px;">Browser does not support setSinkId. System default output will be used.</div>';

    outputAssignmentPanel.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">Output Assignments</div>${rows}${footer}`;
  }

  function renderOutputRoutingStatus(assignments?: OutputAssignment[]) {
    const panel = document.getElementById("io-status-panel");
    if (!panel) return;

    const manager = getRoutingManager();
    if (!manager) {
      panel.textContent = "Output routing pending audio initialization.";
      renderOutputAssignmentPanel(assignments);
      return;
    }

    const data = assignments ?? manager.getAssignments();
    if (!data.length) {
      panel.textContent = "No output routing data available.";
      renderOutputAssignmentPanel(assignments);
      return;
    }

    const rows = data.map(assign => {
      let status: string;
      switch (assign.state) {
        case 'custom':
          status = assign.deviceId ? `Device: ${assign.deviceId}` : 'Custom device';
          break;
        case 'disabled':
          status = 'Disabled';
          break;
        case 'error':
          status = `Error: ${assign.error ?? 'unknown'}`;
          break;
        default:
          status = 'System Default';
          break;
      }
      return `<div><strong>${assign.label}</strong>: ${status}</div>`;
    });

    panel.innerHTML = rows.join("");
    renderOutputAssignmentPanel(data);
  }

  async function updateDeviceLists() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    latestOutputDevices = devices.filter(d => d.kind === "audiooutput");
    const inputSel = document.getElementById("input-device") as HTMLSelectElement | null;

    if (inputSel) {
      const previous = inputSel.value;
      inputSel.innerHTML = "";
      devices.filter(d => d.kind === "audioinput").forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Input Device (${d.deviceId})`;
        inputSel.appendChild(opt);
      });
      if (previous && Array.from(inputSel.options).some(opt => opt.value === previous)) {
        inputSel.value = previous;
      }
    }

    rebuildOutputOptions(mainOutputSelect, devices, { defaultLabel: 'System Default (Main Mix)' });
    monitorSelects.forEach(select => rebuildOutputOptions(select, devices, { defaultLabel: 'System Default (Main Mix)', includeDisabled: true }));
    syncOutputSelections();
  }

  await updateDeviceLists();
  navigator.mediaDevices?.addEventListener?.("devicechange", updateDeviceLists);

  // Input device switching
  const inputSel = document.getElementById("input-device") as HTMLSelectElement;
  if (inputSel) {
    inputSel.addEventListener("change", async () => {
      const deviceId = inputSel.value;
      try {
        await navigator.mediaDevices.getUserMedia({ audio: { deviceId } });
        // Stream can be connected to AudioContext here if needed
        logStatus(`Input device switched: ${deviceId}`);
      } catch (e) {
        logStatus("Input device switch error: " + (e as Error).message);
      }
    });
  }

  async function ensureRoutingManager(): Promise<OutputRoutingManager> {
    let manager = getRoutingManager();
    if (!manager) {
      await ensureBaseAudio();
      manager = getRoutingManager();
    }
    if (!manager) {
      throw new Error('OutputRoutingManager unavailable');
    }
    return manager;
  }

  async function assignOutput(target: OutputTarget, value: string) {
    try {
      const manager = await ensureRoutingManager();
      const assignment = await manager.assign(target, value);
      logStatus(`[OutputRouting] ${assignment.label} -> ${assignment.state}${assignment.deviceId ? ` (${assignment.deviceId})` : ''}`);
      renderOutputRoutingStatus(manager.getAssignments());
    } catch (error) {
      logStatus(`[OutputRouting] Failed to assign ${target}: ${(error as Error).message}`);
    }
  }

  if (mainOutputSelect) {
    mainOutputSelect.addEventListener('change', () => {
      assignOutput('main', mainOutputSelect.value || 'default');
    });
  }

  monitorSelects.forEach((select, index) => {
    if (!select) return;
    const target = `monitor${index + 1}` as OutputTarget;
    select.addEventListener('change', () => {
      assignOutput(target, select.value || 'default');
    });
  });

  document.addEventListener(OUTPUT_ROUTING_CHANGED_EVENT, (event) => {
    const detail = (event as CustomEvent<OutputAssignment[]>).detail;
    syncOutputSelections(detail);
    renderOutputRoutingStatus(detail);
  });

  renderOutputRoutingStatus();

  // 既存の手動UIを最初から非表示にする（Start/Stopボタンは除く）
  document.querySelectorAll("#freq-slider,#gain-slider,#freq-value,#gain-value").forEach(el => {
    if (el && el instanceof HTMLElement) el.style.display = "none";
  });
  // 既存の自動生成UIも初期化
  const oldParams = document.getElementById("faust-params");
  if (oldParams) oldParams.remove();

  // Faustノード初期化後にパラメータ情報を取得し、UIを自動生成
  async function renderFaustParams() {
    if (window.faustNode) {
      // getJSONでUI情報を取得
      const json = await window.faustNode.getJSON();
      logStatus("getJSON result: " + JSON.stringify(json));
      let ui: any[] = [];
      try {
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        ui = parsed.ui || [];
      } catch (e) {
        logStatus("getJSON parse error: " + (e as Error).message);
      }
      logStatus("ui: " + JSON.stringify(ui));
      // 既存の自動生成UIを初期化
      const oldParams = document.getElementById("faust-params");
      if (oldParams) oldParams.remove();
      if (!ui || ui.length === 0) return;
      const container = document.createElement("div");
      container.id = "faust-params";
      // Faust UIグループ構造を再帰的に展開
      function appendFaustParams(items: any[], parent: HTMLElement) {
        items.forEach((param: any) => {
          if (param.items) {
            appendFaustParams(param.items, parent);
          } else {
            const paramLabel = param.label || param.shortname || param.address || "param";
            let control: HTMLElement | null = null;
            if (param.type === "button") {
              const btn = document.createElement("button");
              btn.textContent = paramLabel;
              btn.addEventListener("mousedown", () => {
                const toggleAudioCheckbox = document.getElementById("toggle-audio") as HTMLInputElement | null;
                if (window.outputGainNode && toggleAudioCheckbox) {
                  const isChecked = toggleAudioCheckbox.checked;
                  logStatus(`[DEBUG] ${paramLabel} mousedown: toggle=${isChecked}`);
                }
                window.faustNode?.setParamValue(param.address, 1);
                logStatus(paramLabel + " pressed");
              });
              btn.addEventListener("mouseup", () => {
                window.faustNode?.setParamValue(param.address, 0);
              });
              btn.addEventListener("mouseleave", () => {
                window.faustNode?.setParamValue(param.address, 0);
              });
              control = btn;
            } else if (param.type === "checkbox") {
              const label = document.createElement("label");
              label.textContent = paramLabel + ": ";
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.checked = !!param.init;
              checkbox.addEventListener("change", (e) => {
                const v = (e.target as HTMLInputElement).checked ? 1 : 0;
                window.faustNode?.setParamValue(param.address, v);
                logStatus(paramLabel + " changed: " + v);
              });
              label.appendChild(checkbox);
              control = label;
            } else if (param.type === "nentry" || param.type === "vslider" || param.type === "hslider") {
              const label = document.createElement("label");
              label.textContent = paramLabel + ": ";
              const slider = document.createElement("input");
              slider.type = "range";
              slider.min = String(param.min ?? 0);
              slider.max = String(param.max ?? 1);
              slider.step = String(param.step ?? 0.01);
              slider.value = String(param.init ?? 0);
              slider.id = `faust-slider-${(param.address || "").replace(/\//g, "-")}`;
              const valueSpan = document.createElement("span");
              valueSpan.textContent = slider.value;
              slider.addEventListener("input", (e) => {
                const v = (e.target as HTMLInputElement).value;
                valueSpan.textContent = v;
                window.faustNode?.setParamValue(param.address, parseFloat(v));
                logStatus(paramLabel + " changed: " + v);
              });
              label.appendChild(slider);
              label.appendChild(valueSpan);
              control = label;
            }
            if (control) {
              parent.appendChild(control);
              parent.appendChild(document.createElement("br"));
            }
          }
        });
      }
      // Faust UIグループ構造の最上位itemsのみ展開
      let uiItems: any = ui;
      if (Array.isArray(ui) && ui.length === 1 && typeof (ui[0] as any).items !== "undefined") {
        uiItems = (ui[0] as any).items;
      }
      appendFaustParams(uiItems, container);
      document.body.insertBefore(container, document.querySelector(".visualizer-controls"));
    }
  }

  // Audio初期化関数 (Base Audioのみ、DSP適用なし)
  async function initAudioEngineOnly() {
    console.log('[Controller] Initializing audio engine (Base Audio only, no DSP)');

    // Phase 1: Base Audio 確保
    await ensureBaseAudio();

    // MusicalTimeManager ヘルパー設定
    setupMusicalTimeManagerHelpers();

    console.log('[Controller] ✅ Audio engine initialized (DSP not loaded)');
  }

  // DSP適用関数 (既存DSPのクリーンアップ + 新規DSP読み込み)
  async function applyDSPWithCleanup() {
    console.log('[Controller] Applying Faust DSP with cleanup');

    // Phase 1: Base Audio 確保
    await ensureBaseAudio();

    // MusicalTimeManager ヘルパー設定
    setupMusicalTimeManagerHelpers();

    // Phase 1.5: EffectRegistry v2 初期化 (DSP auto-scan)
    try {
      await scanAndRegisterDSPFiles();
      console.log('[Controller] DSP files registered successfully');
    } catch (error) {
      console.warn('[Controller] DSP auto-scan failed:', error);
    }

    // Phase 2: Faust DSP 適用 (cleanupExistingDSP()を内部で呼ぶ)
    await applyFaustDSP();

    // Step1: Trackラップ
    if (window.faustNode && window.audioCtx) {
      if (!listTracks().some(t => t.inputNode === window.faustNode)) {
        const track = createTrackEnvironment(window.audioCtx, window.faustNode);
        // busManager が既に存在する場合 master bus へ接続 (createTrackEnvironment 内でも試行)
        if ((window as any).busManager?.getEffectsInputNode) {
          try { track.volumeGain.disconnect(); } catch { /* ignore */ }
          try { track.volumeGain.connect((window as any).busManager.getEffectsInputNode()); } catch { /* ignore */ }
        }
      }
    }
    await renderFaustParams();

    console.log('[Controller] ✅ Faust DSP applied successfully');
  }

  // Audio初期化時にも自動UIを生成 (後方互換性のため保持)
  // 注意: 現在は applyDSPWithCleanup() を使用することを推奨
  // @ts-ignore - 後方互換性のため保持
  async function initAudioAndRenderUI() {
    await applyDSPWithCleanup();
  }

  // DSP Apply button generation
  let applyBtn = document.getElementById("apply-dsp-btn") as HTMLButtonElement;
  if (!applyBtn) {
    applyBtn = document.createElement("button");
    applyBtn.id = "apply-dsp-btn";
    applyBtn.textContent = "Apply DSP";
    document.body.insertBefore(applyBtn, document.querySelector(".visualizer-controls"));
  }
  applyBtn.addEventListener("click", async () => {
    logStatus("DSP reapplication: Reloading /dsp/mysynth.dsp");
    try {
      await suspendAudio();
      await applyDSPWithCleanup(); // 変更: initAudioAndRenderUI() から applyDSPWithCleanup() へ
      logStatus("DSP reapplication completed");
    } catch (e) {
      logStatus("DSP reapplication error: " + (e as Error).message);
    }
  });

  // テストボタンコンテナを作成（Phase 5: Hidden, command-based access only）
  let testButtonContainer = document.getElementById("test-button-container");
  if (!testButtonContainer) {
    testButtonContainer = document.createElement("div");
    testButtonContainer.id = "test-button-container";
    testButtonContainer.style.marginBottom = "10px";
    testButtonContainer.style.display = "none"; // Hidden for Phase 5
    testButtonContainer.style.flexWrap = "wrap";
    testButtonContainer.style.gap = "6px";
    testButtonContainer.style.maxWidth = "calc(100% - 320px)"; // Logic Inputsの幅(280px + margin)を考慮して広く
    testButtonContainer.style.paddingRight = "10px"; // 右端に余白
    document.body.insertBefore(testButtonContainer, document.querySelector(".visualizer-controls"));
  }

  // Initialize Test Commands System
  testCommands; // Ensure import is used
  console.log('🧪 Test Commands System available!');
  console.log('💡 Quick Start: test("base-audio") → test("musical-time") → test("phase4-audioworklet")');
  console.log('📋 Use testHelp() for detailed help or testList() to see all commands.');

  // Create visible help text for users
  const helpText = document.createElement('div');
  helpText.style.position = 'fixed';
  helpText.style.bottom = '10px';
  helpText.style.left = '10px';
  helpText.style.background = 'rgba(0,0,0,0.8)';
  helpText.style.color = 'white';
  helpText.style.padding = '8px 12px';
  helpText.style.borderRadius = '4px';
  helpText.style.fontSize = '11px';
  helpText.style.zIndex = '1000';
  helpText.innerHTML = '🧪 Tests: <code>testHelp()</code> | <code>testList()</code> | <code>test("base-audio")</code>';
  document.body.appendChild(helpText);

  // Test command handler function
  function handleTestCommand(commandType: string) {
    switch (commandType) {
      case 'musical-time-tests':
        document.getElementById('mtm-test-btn')?.click();
        break;
      case 'base-audio':
        document.getElementById('base-audio-btn')?.click();
        break;
      case 'phase4-audioworklet':
        document.getElementById('phase4-test-btn')?.click();
        break;
      case 'performance-monitor':
        document.getElementById('perf-monitor-btn')?.click();
        break;
      case 'memory-optimize':
        document.getElementById('memory-optimize-btn')?.click();
        break;
      case 'stress-test':
        document.getElementById('stress-test-btn')?.click();
        break;
      case 'worklet-comparison':
        document.getElementById('worklet-comparison-btn')?.click();
        break;
      case 'timing-test':
        document.getElementById('timing-test-btn')?.click();
        break;
      case 'beat-test':
        document.getElementById('simple-beat-test-btn')?.click();
        break;
      case 'mtm-performance':
        document.getElementById('mtm-perf-btn')?.click();
        break;
      case 'mtm-tempo':
        document.getElementById('mtm-tempo-btn')?.click();
        break;
      case 'mtm-complex':
        document.getElementById('mtm-complex-btn')?.click();
        break;
      case 'mtm-metronome':
        document.getElementById('mtm-metronome-btn')?.click();
        break;
      default:
        console.error(`❌ Unknown test command: ${commandType}`);
    }
  }

  // Setup test command event handlers
  document.addEventListener('test-command', (event: Event) => {
    const customEvent = event as CustomEvent;
    const commandType = customEvent.detail;
    handleTestCommand(commandType);
  });

  // Base Audio Only 初期化ボタン (Test Signal用) - Keep visible for quick access
  let baseAudioBtn = document.getElementById("base-audio-btn") as HTMLButtonElement;
  if (!baseAudioBtn) {
    baseAudioBtn = document.createElement("button");
    baseAudioBtn.id = "base-audio-btn";
    baseAudioBtn.textContent = "🔊 Enable Test Signals";
    baseAudioBtn.style.backgroundColor = "#e8f5e8";
    baseAudioBtn.style.border = "1px solid #4a9";
    baseAudioBtn.style.borderRadius = "4px";
    baseAudioBtn.style.padding = "6px 12px";
    baseAudioBtn.style.fontWeight = "bold";
    baseAudioBtn.style.fontSize = "13px";
    baseAudioBtn.style.whiteSpace = "nowrap";
    baseAudioBtn.style.position = "fixed";
    baseAudioBtn.style.top = "10px";
    baseAudioBtn.style.left = "10px";
    baseAudioBtn.style.zIndex = "1100";
    baseAudioBtn.title = "Initialize audio engine for test signals (without DSP)";

    // Insert before visualizer controls but visible
    document.body.insertBefore(baseAudioBtn, document.querySelector(".visualizer-controls"));
  }
  baseAudioBtn.addEventListener("click", async () => {
    logStatus("Base Audio initialization: AudioContext + TestSignalManager ready");
    try {
      await ensureBaseAudio();

      // DSP auto-scan をBase Audio段階でも実行
      try {
        await scanAndRegisterDSPFiles();
        console.log('[Controller] DSP files registered successfully (Base Audio stage)');
      } catch (error) {
        console.warn('[Controller] DSP auto-scan failed at Base Audio stage:', error);
      }

      baseAudioBtn.textContent = "✅ Test Signals Ready";
      baseAudioBtn.style.backgroundColor = "#d4edda";
      baseAudioBtn.style.borderColor = "#28a745";
      baseAudioBtn.disabled = true;
      logStatus("Base Audio initialization completed - Test signals now available");

    } catch (e) {
      logStatus("Base Audio initialization error: " + (e as Error).message);
      baseAudioBtn.textContent = "❌ Failed - Retry";
      baseAudioBtn.style.backgroundColor = "#f8d7da";
      baseAudioBtn.style.borderColor = "#dc3545";
    }
  });

  // MusicalTimeManager テストボタン追加
  let mtmTestBtn = document.getElementById("mtm-test-btn") as HTMLButtonElement;
  if (!mtmTestBtn) {
    mtmTestBtn = document.createElement("button");
    mtmTestBtn.id = "mtm-test-btn";
    mtmTestBtn.textContent = "🎼 Musical Time Tests";
    mtmTestBtn.style.backgroundColor = "#e8f0ff";
    mtmTestBtn.style.border = "1px solid #4a90e2";
    mtmTestBtn.style.borderRadius = "4px";
    mtmTestBtn.style.padding = "6px 12px";
    mtmTestBtn.style.fontWeight = "bold";
    mtmTestBtn.style.fontSize = "13px";
    mtmTestBtn.style.whiteSpace = "nowrap";
    mtmTestBtn.title = "Test MusicalTimeManager features (requires Base Audio)";
    testButtonContainer.appendChild(mtmTestBtn);
  }
  mtmTestBtn.addEventListener("click", async () => {
    await runAllMusicalTimeTestsWithInit();
  });

  // タイミング計測テストボタン追加
  let timingTestBtn = document.getElementById("timing-test-btn") as HTMLButtonElement;
  if (!timingTestBtn) {
    timingTestBtn = document.createElement("button");
    timingTestBtn.id = "timing-test-btn";
    timingTestBtn.textContent = "⏱️ Timing Measurement";
    timingTestBtn.style.backgroundColor = "#fff0e8";
    timingTestBtn.style.border = "1px solid #e2904a";
    timingTestBtn.style.borderRadius = "4px";
    timingTestBtn.style.padding = "6px 12px";
    timingTestBtn.style.fontWeight = "bold";
    timingTestBtn.style.fontSize = "13px";
    timingTestBtn.style.whiteSpace = "nowrap";
    timingTestBtn.title = "Measure beat timing accuracy";
    testButtonContainer.appendChild(timingTestBtn);
  }
  timingTestBtn.addEventListener("click", async () => {
    console.log('⏱️ Starting timing measurement test...');
    const { testMetronomeWithMeasurement } = await import('./musicalTimeTests.js');
    testMetronomeWithMeasurement();
  });

  // シンプルビートタイミングテストボタン追加
  let simpleBeatTestBtn = document.getElementById("simple-beat-test-btn") as HTMLButtonElement;
  if (!simpleBeatTestBtn) {
    simpleBeatTestBtn = document.createElement("button");
    simpleBeatTestBtn.id = "simple-beat-test-btn";
    simpleBeatTestBtn.textContent = "🎯 Simple Beat Test";
    simpleBeatTestBtn.style.backgroundColor = "#f0fff0";
    simpleBeatTestBtn.style.border = "1px solid #4ae24a";
    simpleBeatTestBtn.style.borderRadius = "4px";
    simpleBeatTestBtn.style.padding = "6px 12px";
    simpleBeatTestBtn.style.fontWeight = "bold";
    simpleBeatTestBtn.style.fontSize = "13px";
    simpleBeatTestBtn.style.whiteSpace = "nowrap";
    simpleBeatTestBtn.title = "Pure timing test (120BPM 4/4, no tempo changes)";
    testButtonContainer.appendChild(simpleBeatTestBtn);
  }
  simpleBeatTestBtn.addEventListener("click", async () => {
    console.log('🎯 Starting simple beat timing test...');
    const { testSimpleBeatTiming } = await import('./musicalTimeTests.js');
    testSimpleBeatTiming();
  });

  // MusicalTimeManager フルパフォーマンステストボタン
  let mtmPerfBtn = document.getElementById("mtm-perf-btn") as HTMLButtonElement;
  if (!mtmPerfBtn) {
    mtmPerfBtn = document.createElement("button");
    mtmPerfBtn.id = "mtm-perf-btn";
    mtmPerfBtn.textContent = "🎭 Full Performance Demo";
    mtmPerfBtn.style.backgroundColor = "#fff0e8";
    mtmPerfBtn.style.border = "1px solid #e2904a";
    mtmPerfBtn.style.borderRadius = "4px";
    mtmPerfBtn.style.padding = "6px 12px";
    mtmPerfBtn.style.fontWeight = "bold";
    mtmPerfBtn.style.fontSize = "13px";
    mtmPerfBtn.style.whiteSpace = "nowrap";
    mtmPerfBtn.title = "30-second demo performance with musical time control";
    testButtonContainer.appendChild(mtmPerfBtn);
  }
  mtmPerfBtn.addEventListener("click", async () => {
    await testFullPerformanceWithInit();
  });

  // MusicalTimeManager テンポ変化テストボタン
  let mtmTempoBtn = document.getElementById("mtm-tempo-btn") as HTMLButtonElement;
  if (!mtmTempoBtn) {
    mtmTempoBtn = document.createElement("button");
    mtmTempoBtn.id = "mtm-tempo-btn";
    mtmTempoBtn.textContent = "🎵 Tempo Changes";
    mtmTempoBtn.style.backgroundColor = "#ffe8f0";
    mtmTempoBtn.style.border = "1px solid #e24a8a";
    mtmTempoBtn.style.borderRadius = "4px";
    mtmTempoBtn.style.padding = "6px 12px";
    mtmTempoBtn.style.fontWeight = "bold";
    mtmTempoBtn.style.fontSize = "13px";
    mtmTempoBtn.style.whiteSpace = "nowrap";
    mtmTempoBtn.title = "Test tempo-aware musical time calculations";
    testButtonContainer.appendChild(mtmTempoBtn);
  }
  mtmTempoBtn.addEventListener("click", async () => {
    const { testTempoChanges } = await import('./musicalTimeTests.js');
    testTempoChanges();
  });

  // MusicalTimeManager 複雑音楽時間テストボタン
  let mtmComplexBtn = document.getElementById("mtm-complex-btn") as HTMLButtonElement;
  if (!mtmComplexBtn) {
    mtmComplexBtn = document.createElement("button");
    mtmComplexBtn.id = "mtm-complex-btn";
    mtmComplexBtn.textContent = "🎼 Complex Times";
    mtmComplexBtn.style.backgroundColor = "#f0e8ff";
    mtmComplexBtn.style.border = "1px solid #8a4ae2";
    mtmComplexBtn.style.borderRadius = "4px";
    mtmComplexBtn.style.padding = "6px 12px";
    mtmComplexBtn.style.fontWeight = "bold";
    mtmComplexBtn.style.fontSize = "13px";
    mtmComplexBtn.style.whiteSpace = "nowrap";
    mtmComplexBtn.title = "Test complex musical time signatures and calculations";
    testButtonContainer.appendChild(mtmComplexBtn);
  }
  mtmComplexBtn.addEventListener("click", async () => {
    const { testComplexMusicalTimes } = await import('./musicalTimeTests.js');
    testComplexMusicalTimes();
  });

  // MusicalTimeManager メトロノームテストボタン
  let mtmMetronomeBtn = document.getElementById("mtm-metronome-btn") as HTMLButtonElement;
  if (!mtmMetronomeBtn) {
    mtmMetronomeBtn = document.createElement("button");
    mtmMetronomeBtn.id = "mtm-metronome-btn";
    mtmMetronomeBtn.textContent = "🥁 Metronome Test";
    mtmMetronomeBtn.style.backgroundColor = "#e8ffe8";
    mtmMetronomeBtn.style.border = "1px solid #4ae24a";
    mtmMetronomeBtn.style.borderRadius = "4px";
    mtmMetronomeBtn.style.padding = "6px 12px";
    mtmMetronomeBtn.style.fontWeight = "bold";
    mtmMetronomeBtn.style.fontSize = "13px";
    mtmMetronomeBtn.style.whiteSpace = "nowrap";
    mtmMetronomeBtn.title = "Test audio metronome with different beat types";
    testButtonContainer.appendChild(mtmMetronomeBtn);
  }
  mtmMetronomeBtn.addEventListener("click", async () => {
    const { testMetronome } = await import('./musicalTimeTests.js');
    testMetronome();
  });

  // メトロノーム専用コントロールコンテナ（改行対応）
  let metronomeControlContainer = document.getElementById("metronome-control-container");
  if (!metronomeControlContainer) {
    metronomeControlContainer = document.createElement("div");
    metronomeControlContainer.id = "metronome-control-container";
    metronomeControlContainer.style.marginBottom = "8px";
    metronomeControlContainer.style.display = "flex";
    metronomeControlContainer.style.flexWrap = "wrap";
    metronomeControlContainer.style.gap = "6px";
    metronomeControlContainer.style.alignItems = "center";
    metronomeControlContainer.style.maxWidth = "calc(100% - 320px)"; // Logic Inputsの幅を考慮して広く
    metronomeControlContainer.style.paddingRight = "10px"; // 右端に余白
    document.body.insertBefore(metronomeControlContainer, document.querySelector(".visualizer-controls"));
  }

  // メトロノームOn/Offボタン
  let metronomeToggleBtn = document.getElementById("metronome-toggle-btn") as HTMLButtonElement;
  if (!metronomeToggleBtn) {
    metronomeToggleBtn = document.createElement("button");
    metronomeToggleBtn.id = "metronome-toggle-btn";
    metronomeToggleBtn.textContent = "🔇 Metronome Off";
    metronomeToggleBtn.style.backgroundColor = "#f0f0f0";
    metronomeToggleBtn.style.border = "1px solid #ccc";
    metronomeToggleBtn.style.borderRadius = "4px";
    metronomeToggleBtn.style.padding = "6px 12px";
    metronomeToggleBtn.style.fontWeight = "bold";
    metronomeToggleBtn.style.fontSize = "13px";
    metronomeToggleBtn.style.whiteSpace = "nowrap";
    metronomeToggleBtn.title = "Toggle metronome on/off";
    metronomeControlContainer.appendChild(metronomeToggleBtn);

    // メトロノーム状態管理
    let metronomeEnabled = false;

    metronomeToggleBtn.addEventListener("click", async () => {
      const { getMusicalTimeManager } = await import('./audio/musicalTimeManager.js');
      const manager = getMusicalTimeManager();

      if (!manager) {
        console.error('❌ MusicalTimeManager not initialized. Please run "🎼 Musical Time Tests" first');
        return;
      }

      metronomeEnabled = !metronomeEnabled;

      if (metronomeEnabled) {
        manager.enableMetronome();
        metronomeToggleBtn.textContent = "🥁 Metronome On";
        metronomeToggleBtn.style.backgroundColor = "#e8ffe8";
        metronomeToggleBtn.style.border = "1px solid #4ae24a";
        console.log('🥁 Metronome enabled via toggle button');
      } else {
        manager.disableMetronome();
        metronomeToggleBtn.textContent = "🔇 Metronome Off";
        metronomeToggleBtn.style.backgroundColor = "#f0f0f0";
        metronomeToggleBtn.style.border = "1px solid #ccc";
        console.log('🔇 Metronome disabled via toggle button');
      }
    });
  }

  // メトロノーム音量スライダー
  let metronomeVolumeContainer = document.getElementById("metronome-volume-container");
  if (!metronomeVolumeContainer) {
    metronomeVolumeContainer = document.createElement("div");
    metronomeVolumeContainer.id = "metronome-volume-container";
    metronomeVolumeContainer.style.display = "flex";
    metronomeVolumeContainer.style.alignItems = "center";
    metronomeVolumeContainer.style.gap = "4px";

    const volumeLabel = document.createElement("label");
    volumeLabel.textContent = "🔊 Vol: ";
    volumeLabel.style.fontSize = "12px";

    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.id = "metronome-volume-slider";
    volumeSlider.min = "0";
    volumeSlider.max = "1";
    volumeSlider.step = "0.1";
    volumeSlider.value = "0.3";
    volumeSlider.style.width = "60px";
    volumeSlider.title = "Metronome volume";

    const volumeValue = document.createElement("span");
    volumeValue.id = "metronome-volume-value";
    volumeValue.textContent = "0.3";
    volumeValue.style.fontSize = "12px";
    volumeValue.style.minWidth = "25px";
    volumeValue.style.display = "inline-block";

    metronomeVolumeContainer.appendChild(volumeLabel);
    metronomeVolumeContainer.appendChild(volumeSlider);
    metronomeVolumeContainer.appendChild(volumeValue);

    metronomeControlContainer.appendChild(metronomeVolumeContainer);

    volumeSlider.addEventListener("input", async () => {
      const volume = parseFloat(volumeSlider.value);
      volumeValue.textContent = volume.toFixed(1);

      const { getMusicalTimeManager } = await import('./audio/musicalTimeManager.js');
      const manager = getMusicalTimeManager();
      if (manager) {
        manager.setMetronomeVolume(volume);
      }
    });
  }

  // メトロノーム使用例ヘルプボタン
  let metronomeHelpBtn = document.getElementById("metronome-help-btn") as HTMLButtonElement;
  if (!metronomeHelpBtn) {
    metronomeHelpBtn = document.createElement("button");
    metronomeHelpBtn.id = "metronome-help-btn";
    metronomeHelpBtn.textContent = "❓ Metronome Help";
    metronomeHelpBtn.style.backgroundColor = "#fffacd";
    metronomeHelpBtn.style.border = "1px solid #ddd";
    metronomeHelpBtn.style.borderRadius = "4px";
    metronomeHelpBtn.style.padding = "6px 12px";
    metronomeHelpBtn.style.fontSize = "12px";
    metronomeHelpBtn.style.whiteSpace = "nowrap";
    metronomeHelpBtn.title = "Show metronome usage examples";
    metronomeControlContainer.appendChild(metronomeHelpBtn);

    metronomeHelpBtn.addEventListener("click", async () => {
      const { showMetronomeUsage } = await import('./musicalTimeTests.js');
      showMetronomeUsage();
    });
  }

  // ======= Phase 4: Performance Optimization (AudioWorklet) =======

  // Phase 4 AudioWorklet テストボタン
  let phase4TestBtn = document.getElementById("phase4-test-btn") as HTMLButtonElement;
  if (!phase4TestBtn) {
    phase4TestBtn = document.createElement("button");
    phase4TestBtn.id = "phase4-test-btn";
    phase4TestBtn.textContent = "⚡ Phase 4: AudioWorklet Test";
    phase4TestBtn.style.backgroundColor = "#fff0e6";
    phase4TestBtn.style.border = "1px solid #ff9500";
    phase4TestBtn.style.borderRadius = "4px";
    phase4TestBtn.style.padding = "6px 12px";
    phase4TestBtn.style.fontWeight = "bold";
    phase4TestBtn.style.fontSize = "13px";
    phase4TestBtn.style.whiteSpace = "nowrap";
    phase4TestBtn.title = "Test high-performance AudioWorklet signal generation";
    testButtonContainer.appendChild(phase4TestBtn);
  }
  phase4TestBtn.addEventListener("click", async () => {
    try {
      // AudioContextを取得
      if (!window.audioCtx) {
        console.error('❌ AudioContext not initialized. Please start Audio Engine first.');
        return;
      }

      // BaseAudioシステムの初期化確認
      if (!window.busManager) {
        console.error('❌ BaseAudio not initialized. Please run "🎼 Musical Time Tests" or "🎵 Base Audio" first.');
        alert('BaseAudio system not initialized.\nPlease click "🎵 Base Audio" button first.');
        return;
      }

      // Logic Input Managerの確認
      if (!window.logicInputManagerInstance) {
        console.error('❌ Logic Input Manager not initialized. Please run "🎼 Musical Time Tests" or "🎵 Base Audio" first.');
        alert('Logic Input Manager not initialized.\nPlease click "🎵 Base Audio" button first.');
        return;
      }

      console.log('✅ Base Audio and Logic Input Manager ready');

      const { TestSignalManagerV2 } = await import('./audio/testSignalManagerV2.js');
      const testManager = new TestSignalManagerV2(window.audioCtx);
      await testManager.initialize();

      console.log('🚀 Phase 4 AudioWorklet system initialized');
      console.log('⚡ Starting high-performance test signal...');

      await testManager.start('tone', 'Logic-Input-1', { frequency: 440, amplitude: 0.2 });

      setTimeout(async () => {
        testManager.stop('Logic-Input-1');
        console.log('✅ Phase 4 AudioWorklet test completed');
      }, 3000);

    } catch (error) {
      console.error('❌ Phase 4 AudioWorklet test failed:', error);
    }
  });

  // Phase 4 パフォーマンスモニターボタン
  let perfMonitorBtn = document.getElementById("perf-monitor-btn") as HTMLButtonElement;
  if (!perfMonitorBtn) {
    perfMonitorBtn = document.createElement("button");
    perfMonitorBtn.id = "perf-monitor-btn";
    perfMonitorBtn.textContent = "📊 Performance Monitor";
    perfMonitorBtn.style.backgroundColor = "#f0f8ff";
    perfMonitorBtn.style.border = "1px solid #4682b4";
    perfMonitorBtn.style.borderRadius = "4px";
    perfMonitorBtn.style.padding = "6px 12px";
    perfMonitorBtn.style.fontWeight = "bold";
    perfMonitorBtn.style.fontSize = "13px";
    perfMonitorBtn.style.whiteSpace = "nowrap";
    perfMonitorBtn.title = "Monitor audio performance metrics (latency, memory, CPU)";
    testButtonContainer.appendChild(perfMonitorBtn);
  }
  perfMonitorBtn.addEventListener("click", async () => {
    try {
      // AudioContextを取得
      if (!window.audioCtx) {
        console.error('❌ AudioContext not initialized. Please start Audio Engine first.');
        return;
      }

      const { PerformanceMonitor } = await import('./audio/performanceMonitor.js');
      const monitor = new PerformanceMonitor(window.audioCtx);

      console.log('📊 Starting performance monitoring...');

      // 監視開始
      monitor.startMonitoring();

      // 1秒後にレポート生成
      setTimeout(() => {
        const report = monitor.generateReport();

        console.log('=== PERFORMANCE REPORT ===');
        console.log(report);

        // 監視停止
        monitor.stopMonitoring();
        console.log('📊 Performance monitoring completed');

      }, 1000);

    } catch (error) {
      console.error('❌ Performance monitoring failed:', error);
    }
  });

  // Phase 4b Memory Optimization ボタン
  let memoryOptimizeBtn = document.getElementById("memory-optimize-btn") as HTMLButtonElement;
  if (!memoryOptimizeBtn) {
    memoryOptimizeBtn = document.createElement("button");
    memoryOptimizeBtn.id = "memory-optimize-btn";
    memoryOptimizeBtn.textContent = "🧠 Phase 4b: Memory Optimize";
    memoryOptimizeBtn.style.backgroundColor = "#f0fff0";
    memoryOptimizeBtn.style.border = "1px solid #32cd32";
    memoryOptimizeBtn.style.borderRadius = "4px";
    memoryOptimizeBtn.style.padding = "6px 12px";
    memoryOptimizeBtn.style.fontWeight = "bold";
    memoryOptimizeBtn.style.fontSize = "13px";
    memoryOptimizeBtn.style.whiteSpace = "nowrap";
    memoryOptimizeBtn.title = "Advanced memory optimization and detailed memory analysis";
    testButtonContainer.appendChild(memoryOptimizeBtn);
  }
  memoryOptimizeBtn.addEventListener("click", async () => {
    try {
      console.log('🧠 Phase 4b: Starting advanced memory optimization...');

      // MemoryManager取得
      const { memoryManager } = await import('./audio/memoryManager.js');

      // 最適化前のメモリ状況
      const beforeStats = memoryManager.getLatestMemoryStats();
      const beforePoolStats = memoryManager.getBufferPoolStats();

      console.log('📊 Before Optimization:', {
        heapUsed: beforeStats ? `${(beforeStats.heapUsed / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
        audioBuffers: beforeStats ? `${(beforeStats.audioBuffers / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
        bufferPools: `${beforePoolStats.totalPools} pools, ${beforePoolStats.totalBuffers} buffers, ${(beforePoolStats.memoryUsage / 1024 / 1024).toFixed(2)}MB`
      });

      // メモリ最適化実行
      memoryManager.optimize();

      // 最適化後の状況確認 (少し待つ)
      setTimeout(() => {
        const afterStats = memoryManager.getLatestMemoryStats();
        const afterPoolStats = memoryManager.getBufferPoolStats();

        console.log('📊 After Optimization:', {
          heapUsed: afterStats ? `${(afterStats.heapUsed / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
          audioBuffers: afterStats ? `${(afterStats.audioBuffers / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
          bufferPools: `${afterPoolStats.totalPools} pools, ${afterPoolStats.totalBuffers} buffers, ${(afterPoolStats.memoryUsage / 1024 / 1024).toFixed(2)}MB`
        });

        // メモリ使用履歴表示
        const history = memoryManager.getMemoryHistory();
        const recentHistory = history.slice(-5);

        console.log('📈 Recent Memory History:');
        recentHistory.forEach((stat, idx) => {
          console.log(`  ${idx + 1}. Heap: ${(stat.heapUsed / 1024 / 1024).toFixed(2)}MB, Audio: ${(stat.audioBuffers / 1024 / 1024).toFixed(2)}MB, Faust: ${(stat.faustModules / 1024 / 1024).toFixed(2)}MB`);
        });

        console.log('✅ Phase 4b Memory Optimization completed');
      }, 500);

    } catch (error) {
      console.error('❌ Phase 4b Memory Optimization failed:', error);
    }
  });

  // ストレステストボタン (Phase 4b)
  let stressTestBtn = document.getElementById("stress-test-btn") as HTMLButtonElement;
  if (!stressTestBtn) {
    stressTestBtn = document.createElement("button");
    stressTestBtn.id = "stress-test-btn";
    stressTestBtn.textContent = "🔥 Buffer Stress Test";
    stressTestBtn.style.cssText = `
      background: linear-gradient(135deg, #ff4757, #ff3742);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      font-size: 13px;
      margin-left: 8px;
      box-shadow: 0 2px 8px rgba(255, 71, 87, 0.3);
      transition: all 0.3s ease;
    `;
    stressTestBtn.title = "Create multiple buffer pools to test memory management";
    testButtonContainer.appendChild(stressTestBtn);
  }
  stressTestBtn.addEventListener("click", async () => {
    try {
      console.log('🔥 Starting buffer stress test...');

      // MemoryManager取得
      const { memoryManager } = await import('./audio/memoryManager.js');

      const beforeStats = memoryManager.getBufferPoolStats();
      console.log('📊 Before Stress Test:', beforeStats);

      // ストレステスト実行
      memoryManager.createStressTestBuffers();

      const afterStats = memoryManager.getBufferPoolStats();
      console.log('📊 After Stress Test:', afterStats);

      // 結果表示
      const poolsCreated = afterStats.totalPools - beforeStats.totalPools;
      const buffersCreated = afterStats.totalBuffers - beforeStats.totalBuffers;
      const memoryIncrease = (afterStats.memoryUsage - beforeStats.memoryUsage) / 1024 / 1024;

      console.log('🔥 Stress Test Results:', {
        poolsCreated,
        buffersCreated,
        memoryIncrease: `${memoryIncrease.toFixed(2)}MB`
      });

      alert(`🔥 ストレステスト完了！\n\n✅ 作成されたプール: ${poolsCreated}\n✅ 作成されたバッファ: ${buffersCreated}\n📊 メモリ増加: ${memoryIncrease.toFixed(2)}MB\n\n詳細はコンソールをご確認ください。`);

    } catch (error) {
      console.error('❌ Buffer stress test failed:', error);
    }
  });

  // Phase 4 AudioWorklet vs Main Thread 比較テストボタン
  let workletComparisonBtn = document.getElementById("worklet-comparison-btn") as HTMLButtonElement;
  if (!workletComparisonBtn) {
    workletComparisonBtn = document.createElement("button");
    workletComparisonBtn.id = "worklet-comparison-btn";
    workletComparisonBtn.textContent = "⚔️ AudioWorklet vs Main Thread";
    workletComparisonBtn.style.backgroundColor = "#f5f0ff";
    workletComparisonBtn.style.border = "1px solid #8a2be2";
    workletComparisonBtn.style.borderRadius = "4px";
    workletComparisonBtn.style.padding = "6px 12px";
    workletComparisonBtn.style.fontWeight = "bold";
    workletComparisonBtn.style.fontSize = "13px";
    workletComparisonBtn.style.whiteSpace = "nowrap";
    workletComparisonBtn.title = "Compare performance between AudioWorklet and main thread processing";
    testButtonContainer.appendChild(workletComparisonBtn);
  }
  workletComparisonBtn.addEventListener("click", async () => {
    try {
      // AudioContextを取得
      if (!window.audioCtx) {
        console.error('❌ AudioContext not initialized. Please start Audio Engine first.');
        return;
      }

      // BaseAudioシステムの初期化確認
      if (!window.busManager) {
        console.error('❌ BaseAudio not initialized. Please run "🎼 Musical Time Tests" or "🎵 Base Audio" first.');
        alert('BaseAudio system not initialized.\nPlease click "🎵 Base Audio" button first.');
        return;
      }

      // Logic Input Managerの確認
      if (!window.logicInputManagerInstance) {
        console.error('❌ Logic Input Manager not initialized. Please run "🎼 Musical Time Tests" or "🎵 Base Audio" first.');
        alert('Logic Input Manager not initialized.\nPlease click "🎵 Base Audio" button first.');
        return;
      }

      console.log('⚔️ Starting AudioWorklet vs Main Thread comparison...');

      // Main Thread テスト
      console.log('🧵 Testing Main Thread performance...');
      const mainThreadStart = performance.now();
      const { TestSignalManager } = await import('./audio/testSignalManager.js');
      const mainThreadManager = new TestSignalManager(window.audioCtx);
      await mainThreadManager.start('tone', 'Logic-Input-1', { frequency: 880, amplitude: 0.1 });

      setTimeout(async () => {
        mainThreadManager.stop('Logic-Input-1');
        const mainThreadTime = performance.now() - mainThreadStart;
        console.log(`🧵 Main Thread test time: ${mainThreadTime.toFixed(2)}ms`);

        // AudioWorklet テスト
        console.log('⚡ Testing AudioWorklet performance...');
        const workletStart = performance.now();
        const { TestSignalManagerV2 } = await import('./audio/testSignalManagerV2.js');
        const workletManager = new TestSignalManagerV2(window.audioCtx!);
        await workletManager.initialize();
        await workletManager.start('tone', 'Logic-Input-2', { frequency: 880, amplitude: 0.1 });

        setTimeout(async () => {
          workletManager.stop('Logic-Input-2');
          const workletTime = performance.now() - workletStart;
          console.log(`⚡ AudioWorklet test time: ${workletTime.toFixed(2)}ms`);

          const improvement = ((mainThreadTime - workletTime) / mainThreadTime * 100);
          console.log(`🏆 Performance improvement: ${improvement.toFixed(1)}%`);

          if (improvement > 0) {
            console.log('✅ AudioWorklet is faster! 🚀');
          } else {
            console.log('🤔 Main thread was faster this time');
          }

        }, 1000);
      }, 1000);

    } catch (error) {
      console.error('❌ Performance comparison failed:', error);
    }
  });

  // === Operator Countdown Overlay (Controller-only) ===
  setupOperatorCountdownOverlay();

  const fSlider = document.getElementById("freq-slider") as HTMLInputElement | null;
  const fRead = document.getElementById("freq-value");
  if (fSlider && fRead) {
    fSlider.addEventListener("input", () => {
      const v = parseFloat(fSlider.value);
      fRead.textContent = v.toString();
      logStatus("freq changed: " + v);
      window.faustNode?.setParamValue("/mysynth/freq", v);
    });
  } else {
    logStatus("[DEBUG] freq slider or value element not found");
  }

  const gSlider = document.getElementById("gain-slider") as HTMLInputElement | null;
  const gRead = document.getElementById("gain-value");
  if (gSlider && gRead) {
    gSlider.addEventListener("input", () => {
      const v = parseFloat(gSlider.value);
      gRead.textContent = v.toString();
      logStatus("gain changed: " + v);
      window.faustNode?.setParamValue("/mysynth/gain", v);
    });
  } else {
    logStatus("[DEBUG] gain slider or value element not found");
  }
  /* Visualizer Controls are now handled via postMessage to iframe content */

  // Audio Output ON/OFF Toggle Switch（改良版：自動Engine起動付き）
  const toggleAudioCheckbox = document.getElementById("toggle-audio");
  const toggleAudioLabel = document.getElementById("toggle-audio-label");
  logStatus(`[DEBUG] toggleAudioCheckbox: ${!!toggleAudioCheckbox}, toggleAudioLabel: ${!!toggleAudioLabel}`);
  if (toggleAudioCheckbox instanceof HTMLInputElement && toggleAudioLabel instanceof HTMLSpanElement) {
    // Initial state: OFF
    toggleAudioCheckbox.checked = false;
    toggleAudioLabel.textContent = "Audio Output: OFF";

    let pendingAudioInit: Promise<void> | null = null;

    const ensureAudioEngineReady = async () => {
      if (!pendingAudioInit) {
        pendingAudioInit = (async () => {
          await initAudioEngineOnly(); // 変更: initAudioAndRenderUI() から initAudioEngineOnly() へ
        })();
        try {
          await pendingAudioInit;
        } finally {
          pendingAudioInit = null;
        }
      } else {
        await pendingAudioInit;
      }
    };

    const applyAudioOutputState = async (checked: boolean) => {
      try {
        if (checked) {

          // Audio Output ONの場合、Base Audioのみ起動 (DSPは読み込まない)
          const ctx = window.audioCtx;
          if (!ctx) {
            console.log("[AudioOutput] Starting Audio Engine (Base Audio only, no DSP)...");
            await ensureAudioEngineReady();
          } else if (ctx.state !== "running") {
            console.log("[AudioOutput] Resuming Audio Engine...");
            await resumeAudio();
          }

          // 再チェック（初期化後に AudioContext が存在することを保証）
          if (!window.audioCtx) {
            throw new Error("AudioContext unavailable after initialization");
          }

          if (window.audioCtx.state !== "running") {
            await window.audioCtx.resume();
          }

          // マスターゲインを適用（Trackシステムのマスターボリュームを使用）
          if (window.outputGainNode) {
            const masterGain = window.masterGainValue ?? 1;
            window.outputGainNode.gain.value = masterGain;
            console.log(`[AudioOutput] Output enabled with gain: ${masterGain}`);
          }

          toggleAudioLabel.textContent = "Audio Output: ON";
          logStatus("Audio output enabled - Engine started automatically");
        } else {
          // Audio Output OFFの場合、マスターゲインを0にする（Engine自体は停止しない）
          if (window.outputGainNode) {
            window.outputGainNode.gain.value = 0;
            console.log("[AudioOutput] Output muted (gain = 0)");
          }

          toggleAudioLabel.textContent = "Audio Output: OFF";
          logStatus("Audio output disabled (muted)");
        }
      } catch (e) {
        logStatus("Audio output toggle error: " + (e as Error).message);
        // 失敗時は元に戻す
        toggleAudioCheckbox.checked = !checked;
        toggleAudioLabel.textContent = checked ? "Audio Output: OFF" : "Audio Output: ON";
      }
    };

    toggleAudioCheckbox.addEventListener("change", () => {
      applyAudioOutputState(toggleAudioCheckbox.checked);
    });
  } else {
    logStatus("[DEBUG] toggle-audio/toggle-audio-label elements not found");
  }

  // === Master FX Lazy Queue (案4) ===
  const masterFxQueue: { action: 'add' | 'remove' | 'move' | 'bypass' | 'clear'; payload?: any }[] = [];
  function enqueueMasterFx(job: { action: 'add' | 'remove' | 'move' | 'bypass' | 'clear'; payload?: any }) {
    if ((window as any).busManager?.enqueueFxOp) {
      (window as any).busManager.enqueueFxOp(job.action, job.payload);
    } else {
      masterFxQueue.push(job);
      console.log('[MasterFXQueue] queued', job);
    }
  }
  document.addEventListener('audio-engine-initialized', () => {
    if (!(window as any).busManager) return;
    if (masterFxQueue.length) {
      console.log('[MasterFXQueue] flushing', masterFxQueue.length);
      masterFxQueue.splice(0).forEach(job => {
        (window as any).busManager.enqueueFxOp(job.action, job.payload);
      });
      (window as any).busManager.flushFxOps?.();
    }
  });
});

// Controller-side countdown overlay reacting to composition system events
function setupOperatorCountdownOverlay() {
  // Create container
  let container = document.querySelector<HTMLDivElement>('#operator-countdown-overlay');
  if (!container) {
    container = document.createElement('div');
    container.id = 'operator-countdown-overlay';
    container.style.cssText = [
      'position: fixed',
      'top: 10px',
      'right: 10px',
      'z-index: 1200',
      'padding: 8px 12px',
      'border-radius: 8px',
      'background: rgba(0,0,0,0.7)',
      'color: #fff',
      'font: 600 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      'pointer-events: none',
      'min-width: 140px',
      'text-align: center',
      'opacity: 0',
      'white-space: pre-line',
      'transition: opacity .2s ease'
    ].join(';');
    document.body.appendChild(container);
  }

  let activeRaf: number | null = null;
  let endAt = 0;

  const clearOverlay = () => {
    if (activeRaf !== null) {
      cancelAnimationFrame(activeRaf);
      activeRaf = null;
    }
    container!.style.opacity = '0';
    container!.textContent = '';
  };

  const startOverlay = (seconds: number, label?: string) => {
    const durationMs = Math.max(100, Math.floor(seconds * 1000));
    endAt = performance.now() + durationMs;

    const tick = () => {
      activeRaf = null;
      const now = performance.now();
      const remainingMs = Math.max(0, endAt - now);
      const remainingSec = remainingMs / 1000;

      container!.style.opacity = '1';
      const color = remainingSec > 2 ? '#8BC34A' : remainingSec > 1 ? '#FFC107' : '#FF5722';
      container!.style.setProperty('--accent-color', color);
      container!.style.boxShadow = `0 0 0 2px ${color} inset`;

      const text = remainingSec >= 1 ? `${Math.ceil(remainingSec)} sec` : `${remainingSec.toFixed(1)} s`;
      container!.textContent = (label ? `${label}\n` : '') + `Push in ${text}`;

      if (remainingMs <= 10) {
        setTimeout(clearOverlay, 150);
        return;
      }

      activeRaf = requestAnimationFrame(tick);
    };

    if (activeRaf !== null) cancelAnimationFrame(activeRaf);
    activeRaf = requestAnimationFrame(tick);
  };

  try {
    const channel = new BroadcastChannel('performance-control');
    channel.onmessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (!msg || msg.type !== 'system-event') return;
      if (msg.action !== 'prime_now_next_notifications') return;

      const leadTime = Number(msg?.parameters?.leadTimeSeconds);
      const countdown = Number(msg?.parameters?.countdownSeconds);
      const seconds = Number.isFinite(countdown) ? countdown : (Number.isFinite(leadTime) ? leadTime : 1);
      const label = typeof msg?.description === 'string' ? msg.description : undefined;

      startOverlay(seconds, label);
    };
  } catch (err) {
    console.warn('[Controller] OperatorCountdownOverlay: BroadcastChannel unavailable', err);
  }
}

// DSP音声レベルモニター関数
function monitorDSPLevel() {
  if (!window.faustNode || !window.audioCtx) {
    console.log("DSP monitoring unavailable - node or context missing");
    return;
  }

  const ctx = window.audioCtx;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  // FaustノードとAnalyserを接続（音声には影響しない）
  window.faustNode.connect(analyser);

  let monitoringActive = true;
  function checkLevel() {
    if (!monitoringActive) return;

    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const rms = Math.sqrt(dataArray.reduce((sum, value) => sum + value * value, 0) / dataArray.length);

    if (average > 1 || rms > 1) {
      console.log(`[DSP Monitor] Audio detected - Average: ${average.toFixed(2)}, RMS: ${rms.toFixed(2)}`);
    }

    setTimeout(checkLevel, 500); // 0.5秒間隔でチェック
  }

  console.log("🎵 DSP Level Monitor started (check console for audio activity)");
  checkLevel();

  // 10秒後に停止
  setTimeout(() => {
    monitoringActive = false;
    analyser.disconnect();
    console.log("🔇 DSP Level Monitor stopped");
  }, 10000);
}

(window as any).monitorDSPLevel = monitorDSPLevel;

// マイクルーター診断関数
function diagnoseMicRouter() {
  console.log("=== Mic Router Diagnosis ===");

  if (!window.inputManager) {
    console.log("❌ InputManager not initialized");
    return;
  }

  console.log("✅ InputManager exists:", window.inputManager);

  const micRouter = window.inputManager.getMicRouter();
  if (!micRouter) {
    console.log("❌ MicRouter not available");

    // MicRouter再初期化を試行
    if (window.audioCtx) {
      console.log("🔄 Attempting to reinitialize MicRouter...");
      window.inputManager.initMicRouter(window.audioCtx);
      const newMicRouter = window.inputManager.getMicRouter();
      console.log("- Reinitialized MicRouter:", !!newMicRouter);
    }
    return;
  }

  console.log("✅ MicRouter exists:", micRouter);

  // 利用可能な診断情報を表示
  try {
    console.log("- MicRouter type:", typeof micRouter);
    console.log("- MicRouter methods:", Object.getOwnPropertyNames(micRouter.constructor.prototype));

    // 可能であれば詳細情報を取得
    if (typeof (micRouter as any).getMicInputs === 'function') {
      const inputs = (micRouter as any).getMicInputs();
      console.log("- Mic inputs:", inputs);
    }

    if (typeof (micRouter as any).isConnected === 'function') {
      console.log("- Connection status:", (micRouter as any).isConnected());
    }

  } catch (e) {
    console.log("- Diagnosis error:", e);
  }
}

(window as any).diagnoseMicRouter = diagnoseMicRouter;

// 音声ルーティングチェーン全体の診断
function diagnoseAudioChain() {
  console.log("=== Audio Chain Diagnosis ===");

  if (!window.audioCtx) {
    console.log("❌ AudioContext not available");
    return;
  }

  const ctx = window.audioCtx;
  console.log(`🎵 AudioContext: ${ctx.state}`);

  // OutputGainNode 状態
  if (window.outputGainNode) {
    const toggle = document.getElementById('toggle-audio') as HTMLInputElement;
    console.log(`🔊 OutputGainNode: gain=${window.outputGainNode.gain.value}, toggle=${toggle?.checked}`);
    console.log(`📊 Master gain: ${window.masterGainValue}`);
  } else {
    console.log("❌ OutputGainNode not available");
  }

  // BusManager 状態
  if (window.busManager) {
    console.log("🚌 BusManager:");
    const synthBus = window.busManager.getSynthInputNode();
    const effectsBus = window.busManager.getEffectsInputNode();
    const monitorBus = window.busManager.getMonitorInputNode();
    console.log(`- Synth bus: ${synthBus?.constructor.name} (gain: ${synthBus?.gain?.value})`);
    console.log(`- Effects bus: ${effectsBus?.constructor.name} (gain: ${effectsBus?.gain?.value})`);
    console.log(`- Monitor bus: ${monitorBus?.constructor.name} (gain: ${monitorBus?.gain?.value})`);
  } else {
    console.log("❌ BusManager not available");
  }

  // FaustNode 接続状態
  if (window.faustNode) {
    console.log("🎛️ FaustNode:");
    console.log(`- Inputs: ${window.faustNode.numberOfInputs}, Outputs: ${window.faustNode.numberOfOutputs}`);
    console.log(`- freq: ${window.faustNode.getParamValue("/mysynth/freq")}`);
    console.log(`- gain: ${window.faustNode.getParamValue("/mysynth/gain")}`);
    console.log(`- input_mix: ${window.faustNode.getParamValue("/mysynth/input_mix")}`);
  } else {
    console.log("❌ FaustNode not available");
  }

  // 完全なルーティングチェーンのテスト
  console.log("🧪 Testing complete audio chain...");
  setTimeout(() => {
    testCompleteAudioChain();
  }, 1000);
}

// 完全な音声チェーンテスト
function testCompleteAudioChain() {
  if (!window.faustNode || !window.busManager || !window.outputGainNode) {
    console.log("❌ Required components not available for chain test");
    return;
  }

  console.log("🔗 Testing complete chain: FaustNode → SynthBus → OutputGain → Destination");

  // パラメータを確実に音が出るレベルに設定
  window.faustNode.setParamValue("/mysynth/gain", 0.3);
  window.faustNode.setParamValue("/mysynth/freq", 880);
  window.faustNode.setParamValue("/mysynth/input_mix", 0); // シンセオンリー

  // Audio Output がONであることを確認
  const toggle = document.getElementById('toggle-audio') as HTMLInputElement;
  if (!toggle?.checked) {
    console.log("⚠️ Audio Output is OFF - turning it ON for test");
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  }

  console.log("🔊 Should hear 880Hz sawtooth for 3 seconds...");

  // 3秒後にパラメータをリセット
  setTimeout(() => {
    if (window.faustNode) {
      window.faustNode.setParamValue("/mysynth/gain", 0.1);
      window.faustNode.setParamValue("/mysynth/freq", 440);
      console.log("🔄 Reset parameters to normal levels");
    }
  }, 3000);
}

(window as any).diagnoseAudioChain = diagnoseAudioChain;

// Faust純粋シンセサイザーモード（マイク入力完全無効化）
function enablePureSynthMode() {
  console.log("=== Pure Synth Mode ===");

  if (!window.faustNode) {
    console.log("❌ FaustNode not available");
    return;
  }

  // DSPデフォルト値を使用（freq=200, gain=0.5）
  const defaultFreq = 200;
  const defaultGain = 0.5;

  // UIスライダーの値も同期して設定
  const freqSlider = document.getElementById("freq-slider") as HTMLInputElement;
  const gainSlider = document.getElementById("gain-slider") as HTMLInputElement;
  const freqValue = document.getElementById("freq-value");
  const gainValue = document.getElementById("gain-value");

  // スライダーとFaustパラメータを同期設定
  if (freqSlider && freqValue) {
    freqSlider.value = defaultFreq.toString();
    freqValue.textContent = defaultFreq.toString();
  }
  if (gainSlider && gainValue) {
    gainSlider.value = defaultGain.toString();
    gainValue.textContent = defaultGain.toString();
  }

  // Faustパラメータ設定（マイク入力のみ無効化）
  window.faustNode.setParamValue("/mysynth/input_mix", 0);         // マイク入力 OFF
  window.faustNode.setParamValue("/mysynth/gain", defaultGain);    // DSPデフォルト音量
  window.faustNode.setParamValue("/mysynth/freq", defaultFreq);    // DSPデフォルト周波数

  console.log("🎹 Pure synthesizer mode enabled:");
  console.log("- input_mix: 0 (mic OFF)");
  console.log(`- gain: ${defaultGain} (DSP default volume)`);
  console.log(`- freq: ${defaultFreq}Hz (DSP default)`);
  console.log("🔊 You should now hear a pure 200Hz sawtooth wave!");

  // Audio Output を確実にONにする
  const toggle = document.getElementById('toggle-audio') as HTMLInputElement;
  if (!toggle?.checked) {
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    console.log("🔛 Audio Output turned ON");
  }

  // パラメータ設定後に状態監視を開始
  setTimeout(() => {
    monitorFaustState();
  }, 1000);
}

(window as any).enablePureSynthMode = enablePureSynthMode;

// Faustノードの状態を継続監視
function monitorFaustState() {
  console.log("=== Faust State Monitor ===");

  if (!window.faustNode) {
    console.log("❌ FaustNode not available");
    return;
  }

  let monitorCount = 0;
  const maxMonitor = 20; // 10秒間監視

  const monitor = setInterval(() => {
    monitorCount++;

    try {
      const freq = window.faustNode?.getParamValue("/mysynth/freq");
      const gain = window.faustNode?.getParamValue("/mysynth/gain");
      const mix = window.faustNode?.getParamValue("/mysynth/input_mix");

      console.log(`[${monitorCount}] freq: ${freq?.toFixed(1)}, gain: ${gain?.toFixed(3)}, mix: ${mix?.toFixed(3)}`);

      // パラメータが予期しない値に変わっていないかチェック
      if (freq !== undefined && (freq < 400 || freq > 500)) {
        console.warn(`⚠️ Unexpected freq change: ${freq}`);
      }
      if (gain !== undefined && gain < 0.1) {
        console.warn(`⚠️ Gain too low: ${gain}`);
      }

    } catch (error) {
      console.error(`Monitor error: ${error}`);
    }

    if (monitorCount >= maxMonitor) {
      clearInterval(monitor);
      console.log("🔚 Faust monitoring stopped");
    }
  }, 500);

  console.log("🔍 Monitoring Faust parameters for 10 seconds...");
}

(window as any).monitorFaustState = monitorFaustState;

// 音声継続監視（音が消える原因を特定）
function startContinuousMonitor() {
  console.log("=== Continuous Audio Monitor Started ===");

  if (!window.faustNode || !window.audioCtx || !window.outputGainNode) {
    console.log("❌ Required components not available");
    return;
  }

  let monitorCount = 0;
  let lastAudioTime = Date.now();

  // AudioContext状態監視
  const contextMonitor = setInterval(() => {
    const ctx = window.audioCtx;
    const output = window.outputGainNode;
    const toggle = document.getElementById('toggle-audio') as HTMLInputElement;

    console.log(`[${monitorCount}] AudioContext: ${ctx?.state}, OutputGain: ${output?.gain.value}, Toggle: ${toggle?.checked}`);

    if (ctx?.state !== 'running') {
      console.warn(`⚠️ AudioContext changed to: ${ctx?.state}`);
      // 自動復旧を試行
      ctx?.resume().then(() => {
        console.log("🔄 AudioContext resumed automatically");
      }).catch(err => {
        console.error("❌ Failed to resume AudioContext:", err);
      });
    }

    if (output?.gain.value === 0) {
      console.warn("⚠️ OutputGain is 0");
    }

    if (!toggle?.checked) {
      console.warn("⚠️ Audio Output toggle is OFF");
    }

    monitorCount++;

    // 60秒後に停止
    if (monitorCount >= 60) {
      clearInterval(contextMonitor);
      console.log("🔚 Continuous monitor stopped");
    }
  }, 1000);

  // Faustノード状態の定期確認
  const nodeMonitor = setInterval(() => {
    if (window.faustNode) {
      try {
        const gain = window.faustNode.getParamValue("/mysynth/gain");
        const freq = window.faustNode.getParamValue("/mysynth/freq");

        if (gain > 0) {
          lastAudioTime = Date.now();
        }

        // 5秒間音が出ていない場合は警告
        if (Date.now() - lastAudioTime > 5000) {
          console.warn("⚠️ No audio detected for 5+ seconds");
          console.log(`Current gain: ${gain}, freq: ${freq}`);
        }
      } catch (error) {
        console.error("❌ Faust node access error:", error);
      }
    }
  }, 2000);

  console.log("🎵 Monitoring AudioContext and Faust node states...");

  // 停止関数を提供
  (window as any).stopContinuousMonitor = () => {
    clearInterval(contextMonitor);
    clearInterval(nodeMonitor);
    console.log("🛑 Continuous monitor manually stopped");
  };
}

(window as any).startContinuousMonitor = startContinuousMonitor;

// デバッグ用のデバイスID比較関数をグローバルにエクスポート
(window as any).compareDeviceIDs = () => {
  console.log('=== Device ID Comparison ===');

  // MicRouter から取得されるデバイス (実際の音声処理用)
  console.log('MicInputs (from MicRouter):');
  const im = (window as any).inputManager;
  if (im) {
    const mics = im.getMicInputStatus?.() || [];
    mics.forEach((mic: any, index: number) => {
      console.log(`  [${index}] ID: "${mic.id}", Label: "${mic.label}", HasGainNode: ${!!mic.gainNode}`);
    });
  } else {
    console.log('  InputManager not available');
  }

  // Logic Inputs の現在の割り当て
  console.log('Logic Input Assignments:');
  const lim = (window as any).logicInputManagerInstance;
  if (lim) {
    const inputs = lim.list?.() || [];
    inputs.forEach((input: any, index: number) => {
      console.log(`  [${index}] LogicInput: "${input.id}", AssignedDevice: "${input.assignedDeviceId}", Label: "${input.label}"`);
    });
  } else {
    console.log('  LogicInputManager not available');
  }

  console.log('============================');
};

// デバッグ用の情報表示関数をグローバルに
(window as any).debugAudioSystem = () => {
  console.log('=== Audio System Debug Info ===');
  console.log('logicInputManagerInstance:', (window as any).logicInputManagerInstance);
  console.log('Logic Inputs:', (window as any).logicInputManagerInstance?.list());
  console.log('inputManager:', (window as any).inputManager);
  console.log('Mic Status:', (window as any).inputManager?.getMicInputStatus());
  console.log('busManager:', (window as any).busManager);
  console.log('===============================');
};

// デバッグ用の手動接続テスト関数
(window as any).testConnection = (logicInputId: string) => {
  const lim = (window as any).logicInputManagerInstance;
  const bm = (window as any).busManager;
  const im = (window as any).inputManager;

  if (!lim || !bm || !im) {
    console.error('Required managers not found');
    return;
  }

  const input = lim.list().find((i: any) => i.id === logicInputId);
  if (!input) {
    console.error(`Logic input ${logicInputId} not found`);
    return;
  }

  if (!input.assignedDeviceId) {
    console.error(`No device assigned to ${logicInputId}`);
    return;
  }

  console.log(`Testing connection for ${logicInputId} -> ${input.assignedDeviceId}`);

  const mic = im.getMicInputStatus().find((m: any) => m.id === input.assignedDeviceId);
  if (!mic || !mic.gainNode) {
    console.error(`Mic ${input.assignedDeviceId} not found or no gainNode`);
    return;
  }

  // 手動接続
  bm.ensureInput(input);
  bm.attachSource(input.id, mic.gainNode);
  bm.updateLogicInput(input);
  console.log(`Successfully connected ${input.assignedDeviceId} to ${logicInputId}`);
};

// === PHASE 5 LIVE PERFORMANCE SYSTEM TEST FUNCTIONS ===

/**
 * Phase 5 TrackManager Test
 */
const testPhase5TrackManager = async () => {
  console.log('🎵 Starting Phase 5 TrackManager Test...');

  try {
    // Import TrackManager dynamically
    const { TrackManager } = await import('./audio/trackManager');

    const audioContext = new AudioContext();
    const trackManager = new TrackManager(audioContext);

    // Create different types of tracks
    const micTrack = await trackManager.createTrack({
      kind: 'mic',
      name: 'Test Microphone'
    });
    console.log(`🎤 Created mic track: ${micTrack.id}`);

    const faustTrack = await trackManager.createTrack({
      kind: 'faust',
      name: 'Test Faust Synth'
    });
    console.log(`🎹 Created faust track: ${faustTrack.id}`);

    const customTrack = await trackManager.createTrack({
      kind: 'custom',
      name: 'Test Custom Track'
    });
    console.log(`🎵 Created custom track: ${customTrack.id}`);

    // Get statistics
    const stats = trackManager.getTrackStats();
    console.log('📊 Track Statistics:', stats);

    console.log('✅ Phase 5 TrackManager Test completed successfully');

  } catch (error) {
    console.error('❌ Phase 5 TrackManager Test failed:', error);
  }
};

/**
 * Phase 5 LiveMixer Test
 */
const testPhase5LiveMixer = async () => {
  console.log('🎛️ Starting Phase 5 LiveMixer Test...');

  try {
    // Import LiveMixer dynamically
    const { LiveMixer } = await import('./audio/liveMixer');
    const { LogicInputManager } = await import('./audio/logicInputs');
    const { TrackManager } = await import('./audio/trackManager');

    // 共有AudioContextを使用
    const audioContext = new AudioContext();
    const logicInputManager = new LogicInputManager();
    const trackManager = new TrackManager(audioContext);

    const liveMixer = new LiveMixer(
      audioContext,
      trackManager as any,
      logicInputManager
    );

    // Setup internal synth
    await liveMixer.setupInternalSynth();

    // Get channels
    const channels = liveMixer.getChannels();
    console.log(`🎚️ Created ${channels.length} channels`);

    // Test channel operations
    if (channels.length > 0) {
      const channel = channels[0];
      liveMixer.setChannelVolume(channel.id, 0.8);
      liveMixer.setChannelPan(channel.id, -0.5);
      liveMixer.toggleMute(channel.id);
      console.log(`🎚️ Tested operations on channel: ${channel.name}`);
    }

    console.log('✅ Phase 5 LiveMixer Test completed successfully');

  } catch (error) {
    console.error('❌ Phase 5 LiveMixer Test failed:', error);
  }
};

/**
 * Phase 5 Integration Test
 */
const testPhase5Integration = async () => {
  console.log('🔗 Starting Phase 5 Integration Test...');

  try {
    // Import all Phase 5 components
    const { TrackManager } = await import('./audio/trackManager');
    const { LiveMixer } = await import('./audio/liveMixer');
    const { LogicInputManager } = await import('./audio/logicInputs');

    const audioContext = new AudioContext();
    const logicInputManager = new LogicInputManager();
    const trackManager = new TrackManager(audioContext);

    const liveMixer = new LiveMixer(
      audioContext,
      trackManager as any,
      logicInputManager
    );

    // Create tracks
    const micTrack = await trackManager.createTrack({
      kind: 'mic',
      name: 'Integration Test Mic'
    });
    console.log(`🎤 Created integration mic track: ${micTrack.id}`);

    const synthTrack = await trackManager.createTrack({
      kind: 'faust',
      name: 'Integration Test Synth'
    });
    console.log(`🎹 Created integration synth track: ${synthTrack.id}`);

    // Setup mixer components
    await liveMixer.setupInternalSynth();
    await liveMixer.setupClickTrack();

    // Get final state
    const channels = liveMixer.getChannels();
    const stats = trackManager.getTrackStats();

    console.log('📊 Integration Test Results:');
    console.log(`   - Tracks created: ${stats.total}`);
    console.log(`   - Mixer channels: ${channels.length}`);
    console.log(`   - Track types: ${Object.entries(stats.byKind).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

    console.log('✅ Phase 5 Integration Test completed successfully');

  } catch (error) {
    console.error('❌ Phase 5 Integration Test failed:', error);
  }
};

/**
 * Phase 5 UR22C Setup Test
 */
const testPhase5UR22C = async () => {
  console.log('🎤 Starting Phase 5 UR22C Setup Test...');

  try {
    const { LiveMixer } = await import('./audio/liveMixer');
    const { LogicInputManager } = await import('./audio/logicInputs');
    const { TrackManager } = await import('./audio/trackManager');

    const audioContext = new AudioContext();
    const logicInputManager = new LogicInputManager();
    const trackManager = new TrackManager(audioContext);

    const liveMixer = new LiveMixer(
      audioContext,
      trackManager as any,
      logicInputManager
    );

    // Test UR22C input detection
    await liveMixer.setupUR22CInputs();

    const channels = liveMixer.getChannels();
    console.log(`🎤 UR22C Setup Test: ${channels.length} channels created`);

    console.log('✅ Phase 5 UR22C Setup Test completed');

  } catch (error) {
    console.error('❌ Phase 5 UR22C Setup Test failed:', error);
  }
};

/**
 * Phase 5 Internal Synth Test
 */
const testPhase5Synth = async () => {
  console.log('🎹 Starting Phase 5 Internal Synth Test...');

  try {
    const { LiveMixer } = await import('./audio/liveMixer');
    const { LogicInputManager } = await import('./audio/logicInputs');
    const { TrackManager } = await import('./audio/trackManager');

    const audioContext = new AudioContext();
    const logicInputManager = new LogicInputManager();
    const trackManager = new TrackManager(audioContext);

    const liveMixer = new LiveMixer(
      audioContext,
      trackManager as any,
      logicInputManager
    );

    await liveMixer.setupInternalSynth();

    const channels = liveMixer.getChannels();
    const synthChannels = channels.filter(ch => ch.name.includes('Synth'));

    console.log(`🎹 Synth Test: ${synthChannels.length} synthesizer channels created`);

    console.log('✅ Phase 5 Internal Synth Test completed');

  } catch (error) {
    console.error('❌ Phase 5 Internal Synth Test failed:', error);
  }
};

/**
 * Phase 5 Click Track Test
 */
const testPhase5Click = async () => {
  console.log('🥁 Starting Phase 5 Click Track Test...');

  try {
    const { LiveMixer } = await import('./audio/liveMixer');
    const { LogicInputManager } = await import('./audio/logicInputs');
    const { TrackManager } = await import('./audio/trackManager');

    const audioContext = new AudioContext();
    const logicInputManager = new LogicInputManager();
    const trackManager = new TrackManager(audioContext);

    const liveMixer = new LiveMixer(
      audioContext,
      trackManager as any,
      logicInputManager
    );

    await liveMixer.setupClickTrack();

    const channels = liveMixer.getChannels();
    const clickChannels = channels.filter(ch => ch.name.includes('Click'));

    console.log(`🥁 Click Track Test: ${clickChannels.length} click channels created`);

    console.log('✅ Phase 5 Click Track Test completed');

  } catch (error) {
    console.error('❌ Phase 5 Click Track Test failed:', error);
  }
};

/**
 * Phase 5 Full System Test
 */
const testPhase5Full = async () => {
  console.log('🎪 Starting Phase 5 Full System Test...');

  try {
    const { TrackManager } = await import('./audio/trackManager');
    const { LiveMixer } = await import('./audio/liveMixer');
    const { LogicInputManager } = await import('./audio/logicInputs');

    const audioContext = new AudioContext();
    const logicInputManager = new LogicInputManager();
    const trackManager = new TrackManager(audioContext);

    const liveMixer = new LiveMixer(
      audioContext,
      trackManager as any,
      logicInputManager
    );

    console.log('🔧 Setting up complete Phase 5 system...');

    // Setup all components
    await liveMixer.setupUR22CInputs();
    await liveMixer.setupInternalSynth();
    await liveMixer.setupClickTrack();

    // Get final system state
    const channels = liveMixer.getChannels();
    const stats = trackManager.getTrackStats();
    const levels = liveMixer.getAllLevels();

    console.log('📊 Phase 5 Full System Test Results:');
    console.log(`   - Total tracks: ${stats.total}`);
    console.log(`   - Mixer channels: ${channels.length}`);
    console.log(`   - Active levels: ${Object.keys(levels).length}`);
    console.log(`   - Track breakdown: ${Object.entries(stats.byKind).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

    // Test some channel operations
    channels.forEach((channel, index) => {
      if (index < 3) { // Test first 3 channels
        liveMixer.setChannelVolume(channel.id, 0.7 + (index * 0.1));
        console.log(`🎚️ Configured channel: ${channel.name} (${channel.id})`);
      }
    });

    console.log('✅ Phase 5 Full System Test completed successfully');
    console.log('🎪 Live Performance System is ready for use!');

  } catch (error) {
    console.error('❌ Phase 5 Full System Test failed:', error);
  }
};

// Setup Phase 5 test button event listeners (removed - tests completed)
const setupPhase5TestButtons = () => {
  // UI test buttons have been removed as testing is complete
  // Test functions remain available via console for development
  console.log('🎪 Phase 5 UI test buttons removed - use console functions for testing');
};

// Initialize Phase 5 test buttons when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPhase5TestButtons);
} else {
  setupPhase5TestButtons();
}

console.log('[Controller] Setup complete. Use debugAudioSystem(), compareDeviceIDs() or testConnection(logicInputId) for debugging.');
console.log('[Phase 5] Live Performance System test functions available: testPhase5TrackManager(), testPhase5LiveMixer(), etc.');

// === GLOBAL EXPORTS FOR PHASE 5 TESTING ===
// Make Phase 5 test functions available globally for console testing
(window as any).testPhase5TrackManager = testPhase5TrackManager;
(window as any).testPhase5LiveMixer = testPhase5LiveMixer;
(window as any).testPhase5Integration = testPhase5Integration;
(window as any).testPhase5UR22C = testPhase5UR22C;
(window as any).testPhase5Synth = testPhase5Synth;
(window as any).testPhase5Click = testPhase5Click;
(window as any).testPhase5Full = testPhase5Full;

console.log('🎪 Phase 5 test functions exported to global scope');

// === スマホ送信テストUI ===
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createSimpleTestUI();
    console.log('📱 Simple Test UI initialized');
  });
} else {
  createSimpleTestUI();
  console.log('📱 Simple Test UI initialized');
}

// === Player Screen Test Controls ===
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPlayerScreenTestControls);
} else {
  setupPlayerScreenTestControls();
}
