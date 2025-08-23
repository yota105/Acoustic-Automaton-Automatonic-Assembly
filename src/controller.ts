import { ensureBaseAudio, applyFaustDSP, resumeAudio, suspendAudio } from "./audio/audioCore";
import { createTrackEnvironment, listTracks } from "./audio/tracks";
import { toggleMute, toggleSolo, setTrackVolume } from './audio/tracks';
import { getTrackLevels } from './audio/tracks';
import { InputManager } from "./audio/inputManager";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import "./types/tauri.d.ts";
// --- 新UI分割用: 論理Input・アサイン・ルーティング・物理デバイスUI ---
import { LogicInputManager } from './audio/logicInputs';
import { DeviceAssignmentUI } from './audio/deviceAssignment';
import { RoutingUI } from './audio/routingUI';
import { PhysicalDevicePanel } from './audio/physicalDevicePanel';
import { DeviceDiscovery } from './audio/deviceDiscovery';
import { listRegisteredEffects, preloadAll as preloadAllEffects, createEffectInstance, scanAndRegisterDSPFiles } from './audio/effects/effectRegistry';
import { addTrackEffect, removeTrackEffect, toggleTrackEffectBypass, moveTrackEffect, listTrackEffectsMeta } from './audio/tracks';
// Phase 1テスト関数
import './phase1TestFunctions';
// MusicalTimeManagerテスト関数
import {
  runAllMusicalTimeTestsWithInit,
  testFullPerformanceWithInit,
  setupMusicalTimeManagerHelpers
} from './musicalTimeTests';

/* デバッグ用: 初期化・状態表示 */
function logStatus(msg: string) {
  const log = document.getElementById("debug-log");
  if (log) log.textContent += msg + "\n";
  else console.log(msg);
}

// Check if running in Tauri environment
function isTauriEnvironment(): boolean {
  try {
    // Try to access getCurrentWindow function
    getCurrentWindow();
    return true;
  } catch {
    return false;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  // --- 新UI: 論理Inputベース ---
  const logicInputManager = new LogicInputManager();
  // 初回起動で空ならデフォルト2件追加
  if (logicInputManager.list().length === 0) {
    logicInputManager.add({ label: 'Vocal', assignedDeviceId: null, routing: { synth: true, effects: false, monitor: true }, gain: 1.0 });
    logicInputManager.add({ label: 'Guitar', assignedDeviceId: null, routing: { synth: false, effects: true, monitor: true }, gain: 0.8 });
  }

  // DeviceDiscovery初期化
  const deviceDiscovery = new DeviceDiscovery();
  await deviceDiscovery.enumerate();

  // 物理デバイス取得関数
  function getPhysicalDevices() {
    return deviceDiscovery.listInputs().map(d => ({ id: d.id, label: d.label, enabled: d.enabled }));
  }

  // UI用divを仮設置
  const logicPanel = document.createElement('div');
  logicPanel.id = 'logic-input-panel';
  logicPanel.style.position = 'fixed';
  logicPanel.style.right = '16px'; // 左→右へ
  logicPanel.style.top = '16px';
  logicPanel.style.maxHeight = 'calc(100vh - 32px)';
  logicPanel.style.overflowY = 'auto';
  logicPanel.style.minWidth = '280px'; // 320px → 280px に狭める
  logicPanel.style.maxWidth = '300px'; // 最大幅も制限
  logicPanel.style.background = '#f8faff';
  logicPanel.style.border = '1px solid #c3d4e6';
  logicPanel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
  logicPanel.style.borderRadius = '6px';
  logicPanel.style.padding = '10px 12px'; // 12px 14px → 10px 12px に狭める
  logicPanel.style.zIndex = '1200';
  logicPanel.style.fontSize = '12px'; // 13px → 12px に小さく
  logicPanel.innerHTML = '<b style="font-size:13px;">Logic Inputs / Routing</b><div style="font-size:10px;color:#567;margin-top:2px;">Assignment / Devices included</div>';
  document.body.appendChild(logicPanel);

  const assignDiv = document.createElement('div');
  assignDiv.style.marginTop = '4px';
  logicPanel.appendChild(assignDiv);
  const deviceAssignUI = new DeviceAssignmentUI(logicInputManager, getPhysicalDevices, assignDiv);
  deviceAssignUI.render();

  const routingDiv = document.createElement('div');
  routingDiv.style.marginTop = '8px';
  logicPanel.appendChild(routingDiv);
  const routingUI = new RoutingUI(logicInputManager, routingDiv);
  routingUI.render();
  document.addEventListener('logic-input-assignment-changed', () => { routingUI.render(); updateUnassignedWarning(); });

  const deviceDiv = document.createElement('div');
  deviceDiv.style.marginTop = '8px';
  logicPanel.appendChild(deviceDiv);
  const devicePanel = new PhysicalDevicePanel(getPhysicalDevices, deviceDiv);
  devicePanel.render();

  // 警告表示用div
  const warningDiv = document.createElement('div');
  warningDiv.style.marginTop = '6px';
  warningDiv.style.color = '#c97a00';
  warningDiv.style.fontSize = '11px';
  logicPanel.appendChild(warningDiv);
  function updateUnassignedWarning() {
    const unassigned = logicInputManager.list().filter(i => !i.assignedDeviceId);
    warningDiv.textContent = unassigned.length > 0 ? `Warning: ${unassigned.length} input(s) unassigned.` : '';
  }
  updateUnassignedWarning();

  // === Step1: Trackラップ & audioAPI導入 ===
  // AudioContext, faustNodeが初期化された後にTrackを生成
  // 既存window.faustNode互換も維持
  // window.audioAPIアクセスポイントを提供
  //
  // 気づき: 既存UIやparam操作はwindow.faustNodeを参照しているため、
  //         互換維持のためTrack導入後もwindow.faustNodeは残す
  //         Track配列はlistTracks()で取得可能
  //
  // TODO: MicTrackやSampleTrackは今後拡張

  // audioAPIをwindowに生やす
  // AudioContextとInputManagerをグローバルに保持
  if (!(window as any).audioCtx) {
    const AC = window.AudioContext || (window as any)["webkitAudioContext"];
    (window as any).audioCtx = new AC();
  }
  if (!(window as any).inputManager) {
    (window as any).inputManager = new InputManager();
  }
  const audioCtx = (window as any).audioCtx;
  const inputManager = (window as any).inputManager;

  (window as any).audioAPI = { listTracks, createVirtualMicTrack: (id: string, label: string) => { inputManager.createVirtualMicTrack(audioCtx, id, label); }, removeVirtualMicTrack: (id: string) => { inputManager.removeVirtualMicTrack(id); }, listVirtualMicTracks: () => { return inputManager.listVirtualMicTracks(); }, assignMicTrackRouting: (micId: string, destinations: { synth: boolean; effects: boolean; monitor: boolean }, gain: number = 1.0) => { inputManager.assignMicTrackRouting(micId, destinations, gain); }, testVirtualMicTrack: (id: string) => { const v = inputManager.listVirtualMicTracks().find((t: any) => t.id === id); if (v && audioCtx) { const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < data.length; ++i) data[i] = (Math.random() * 2 - 1) * 0.2; const src = audioCtx.createBufferSource(); src.buffer = buffer; src.connect(v.gainNode); src.start(); src.stop(audioCtx.currentTime + 0.2); src.onended = () => src.disconnect(); } }, };

  // === TrackList UI (最小: name / mute / solo / volume) ===
  const trackListDiv = document.createElement('div');
  trackListDiv.id = 'track-list-panel';
  trackListDiv.style.position = 'fixed';
  trackListDiv.style.right = '16px'; // 右下へ移動
  trackListDiv.style.bottom = '16px';
  trackListDiv.style.background = '#eef4fa';
  trackListDiv.style.border = '1px solid #9ab';
  trackListDiv.style.borderRadius = '6px';
  trackListDiv.style.padding = '8px 10px'; // 10px 12px → 8px 10px に狭める
  trackListDiv.style.fontSize = '11px'; // 12px → 11px に小さく
  trackListDiv.style.width = '380px'; // 420px → 380px に狭める
  trackListDiv.style.maxHeight = '40vh';
  trackListDiv.style.overflowY = 'auto';
  trackListDiv.style.zIndex = '1250';
  document.body.appendChild(trackListDiv);

  function renderTrackList() {
    const tracks = (window as any).audioAPI.listTracks();
    trackListDiv.innerHTML = '<b style="font-size:13px;">Tracks</b><br>' + (tracks.length === 0 ? '<i>No tracks</i>' : '');
    tracks.forEach((t: any) => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '70px 50px 24px 24px 1.6fr 46px';
      row.style.alignItems = 'center';
      row.style.columnGap = '4px';
      row.style.marginTop = '6px';
      row.style.padding = '4px 6px';
      row.style.background = '#fff';
      row.style.border = '1px solid #d4dde5';
      row.style.borderRadius = '4px';
      row.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
      row.dataset.trackId = t.id;

      const name = document.createElement('span');
      name.textContent = t.name;
      name.style.fontSize = '11px';
      name.style.fontWeight = '600';
      name.style.whiteSpace = 'nowrap';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.cursor = 'text';
      name.title = 'クリックでリネーム';
      name.addEventListener('click', () => beginEditTrackName(t.id, name));
      row.appendChild(name);

      // メータ + 数値
      const meterCell = document.createElement('div');
      meterCell.style.display = 'flex';
      meterCell.style.flexDirection = 'column';
      meterCell.style.alignItems = 'stretch';
      const meterWrap = document.createElement('div');
      meterWrap.style.position = 'relative';
      meterWrap.style.width = '100%';
      meterWrap.style.height = '8px';
      meterWrap.style.background = '#223';
      meterWrap.style.borderRadius = '2px';
      const meterFill = document.createElement('div');
      meterFill.className = 'track-meter-fill';
      meterFill.dataset.trackId = t.id;
      meterFill.style.position = 'absolute';
      meterFill.style.left = '0';
      meterFill.style.top = '0';
      meterFill.style.height = '100%';
      meterFill.style.width = '0%';
      meterFill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';
      meterFill.style.transition = 'width 50ms linear';
      meterWrap.appendChild(meterFill);
      meterCell.appendChild(meterWrap);
      const lvl = document.createElement('span');
      lvl.textContent = '-∞';
      lvl.style.fontSize = '9px';
      lvl.style.textAlign = 'center';
      lvl.style.marginTop = '2px';
      lvl.dataset.levelTrackId = t.id;
      meterCell.appendChild(lvl);
      row.appendChild(meterCell);

      const muteBtn = document.createElement('button');
      muteBtn.textContent = t.muted ? 'M' : 'm';
      muteBtn.title = 'Mute';
      muteBtn.style.fontSize = '10px';
      muteBtn.style.padding = '3px 8px';
      muteBtn.style.background = t.muted ? '#f44' : '#ddd';
      muteBtn.style.color = t.muted ? '#fff' : '#333';
      muteBtn.style.border = '1px solid #ccc';
      muteBtn.style.borderRadius = '2px';
      muteBtn.style.cursor = 'pointer';
      muteBtn.addEventListener('click', () => { toggleMute(t.id); });
      row.appendChild(muteBtn);

      const soloBtn = document.createElement('button');
      soloBtn.textContent = t.solo ? 'S' : 's';
      soloBtn.title = 'Solo';
      soloBtn.style.fontSize = '10px';
      soloBtn.style.padding = '3px 8px';
      soloBtn.style.background = t.solo ? '#fa4' : '#ddd';
      soloBtn.style.color = t.solo ? '#fff' : '#333';
      soloBtn.style.border = '1px solid #ccc';
      soloBtn.style.borderRadius = '2px';
      soloBtn.style.cursor = 'pointer';
      soloBtn.addEventListener('click', () => { toggleSolo(t.id); });
      row.appendChild(soloBtn);

      const volWrap = document.createElement('div');
      volWrap.style.display = 'flex';
      volWrap.style.alignItems = 'center';
      volWrap.style.gap = '4px';
      volWrap.style.width = '100%';

      const vol = document.createElement('input');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '1';
      vol.step = '0.001';
      vol.value = String(t.userVolume ?? 1);
      vol.style.width = '100%';
      vol.style.cursor = 'pointer';
      vol.style.minWidth = '120px';
      vol.style.flex = '1';
      vol.dataset.trackId = t.id; // プログラムからの制御用

      const valSpan = document.createElement('span');
      valSpan.style.fontSize = '10px';
      valSpan.style.minWidth = '30px';
      valSpan.style.textAlign = 'center';
      valSpan.style.color = '#567';
      valSpan.style.cursor = 'pointer';
      valSpan.style.padding = '1px 2px';
      valSpan.style.border = '1px solid transparent';
      valSpan.style.borderRadius = '2px';
      valSpan.style.marginLeft = '-12px';
      valSpan.textContent = (parseFloat(vol.value) * 100).toFixed(0);
      valSpan.title = 'クリックで数値入力';

      const updateVolume = (newValue: number) => {
        const v = Math.min(1, Math.max(0, newValue));
        vol.value = v.toString();
        setTrackVolume(t.id, v);
        valSpan.textContent = (v * 100).toFixed(0);
        return v;
      };

      // スライダーイベント（ドラッグ対応）
      vol.addEventListener('input', (e) => {
        e.stopPropagation();
        updateVolume(parseFloat(vol.value));
      });

      vol.addEventListener('change', (e) => {
        e.stopPropagation();
        updateVolume(parseFloat(vol.value));
      });

      // ホイールイベント（より細かい制御）
      vol.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.005 : -0.005;
        updateVolume(parseFloat(vol.value) + delta);
      }, { passive: false });

      // 数値入力機能（簡略化）
      valSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = valSpan.textContent || '100';
        input.style.width = '28px';
        input.style.fontSize = '10px';
        input.style.textAlign = 'center';
        input.style.border = '1px solid #007acc';
        input.style.borderRadius = '2px';
        input.style.outline = 'none';
        input.style.padding = '0';

        const finishEdit = () => {
          const val = parseFloat(input.value);
          if (!isNaN(val) && val >= 0 && val <= 100) {
            updateVolume(val / 100);
          }
          valSpan.style.display = 'block';
          input.remove();
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finishEdit();
          if (e.key === 'Escape') {
            valSpan.style.display = 'block';
            input.remove();
          }
          e.stopPropagation();
        });

        valSpan.style.display = 'none';
        valSpan.parentElement?.insertBefore(input, valSpan);
        input.focus();
        input.select();
      });

      // プログラム制御用のAPIをグローバルに追加
      if (!(window as any).trackVolumeAPI) {
        (window as any).trackVolumeAPI = {};
      }
      (window as any).trackVolumeAPI[t.id] = updateVolume;

      volWrap.appendChild(vol);
      volWrap.appendChild(valSpan);
      row.appendChild(volWrap);

      // === FX 簡易ボタン列 ===
      const fxCell = document.createElement('div');
      fxCell.style.display = 'flex';
      fxCell.style.flexDirection = 'column';
      fxCell.style.alignItems = 'stretch';
      const fxBtn = document.createElement('button');
      fxBtn.textContent = 'FX(0)';
      fxBtn.title = 'Show FX chain';
      fxBtn.style.fontSize = '10px';
      fxBtn.style.padding = '3px 6px';
      fxBtn.style.cursor = 'pointer';
      fxBtn.style.background = '#dde3ea';
      fxBtn.style.border = '1px solid #bcc7d1';
      fxBtn.style.borderRadius = '3px';
      fxBtn.style.position = 'relative';
      fxBtn.style.minWidth = '40px';
      fxCell.appendChild(fxBtn);
      row.appendChild(fxCell);

      let panel: HTMLDivElement | null = null;
      let rendering = false;
      const updateBtnCount = () => {
        const count = ((window as any).trackFxAPI?.list?.(t.id) || []).length;
        fxBtn.textContent = `FX(${count})`;
      };

      function renderFxPanel() {
        if (!panel || rendering) return;
        rendering = true;
        try {
          const chain = (window as any).trackFxAPI?.list?.(t.id) || [];
          updateBtnCount();
          panel.innerHTML = '';
          const hdr = document.createElement('div');
          hdr.style.display = 'flex';
          hdr.style.alignItems = 'center';
          hdr.style.gap = '4px';
          hdr.style.marginBottom = '4px';
          const sel = document.createElement('select');
          sel.style.flex = '1';
          sel.style.fontSize = '10px';
          sel.style.padding = '2px 4px';
          sel.style.minWidth = '0';
          const regs = (window as any).fxAPI?.list?.() || [];
          regs.forEach((r: any) => { const o = document.createElement('option'); o.value = r.refId; o.textContent = r.label; sel.appendChild(o); });
          const addBtn = document.createElement('button');
          addBtn.textContent = '+';
          addBtn.style.fontSize = '11px';
          addBtn.style.padding = '2px 6px';
          addBtn.style.flex = '0 0 auto';
          addBtn.addEventListener('click', async () => {
            const refId = sel.value;
            addBtn.disabled = true;
            try { await (window as any).trackFxAPI.add(t.id, refId); renderFxPanel(); } finally { addBtn.disabled = false; }
          });
          hdr.appendChild(sel); hdr.appendChild(addBtn);
          panel.appendChild(hdr);
          chain.forEach((fx: any, idx: number) => {
            const line = document.createElement('div');
            line.style.display = 'grid';
            line.style.gridTemplateColumns = '16px 1fr auto auto auto auto';
            line.style.alignItems = 'center';
            line.style.fontSize = '10px';
            line.style.marginTop = '4px';
            line.style.columnGap = '4px';
            const order = document.createElement('span'); order.textContent = String(idx + 1); order.style.textAlign = 'center'; order.style.color = '#678';
            const name = document.createElement('span'); name.textContent = fx.refId; name.style.overflow = 'hidden'; name.style.textOverflow = 'ellipsis';
            const byp = document.createElement('button'); byp.textContent = fx.bypass ? 'Byp' : 'On'; byp.style.fontSize = '9px'; byp.style.padding = '2px 4px';
            byp.addEventListener('click', () => { (window as any).trackFxAPI.toggleBypass(fx.id); setTimeout(renderFxPanel, 0); });
            const up = document.createElement('button'); up.textContent = '↑'; up.disabled = idx === 0; up.style.fontSize = '9px'; up.style.padding = '2px 4px';
            up.addEventListener('click', () => { (window as any).trackFxAPI.move(t.id, fx.id, idx - 1); setTimeout(renderFxPanel, 0); });
            const down = document.createElement('button'); down.textContent = '↓'; down.disabled = idx === chain.length - 1; down.style.fontSize = '9px'; down.style.padding = '2px 4px';
            down.addEventListener('click', () => { (window as any).trackFxAPI.move(t.id, fx.id, idx + 1); setTimeout(renderFxPanel, 0); });
            const rm = document.createElement('button'); rm.textContent = '✕'; rm.style.fontSize = '9px'; rm.style.padding = '2px 4px';
            rm.addEventListener('click', () => { (window as any).trackFxAPI.remove(fx.id); setTimeout(renderFxPanel, 0); });
            line.append(order, name, byp, up, down, rm);
            if (panel) panel.appendChild(line);
          });
        } finally { rendering = false; }
      }

      fxBtn.addEventListener('click', () => {
        if (!panel) {
          panel = document.createElement('div');
          panel.className = 'track-fx-panel';
          panel.style.gridColumn = '1 / -1';
          panel.style.marginTop = '4px';
          panel.style.background = '#f4f7fa';
          panel.style.border = '1px solid #ccd3da';
          panel.style.borderRadius = '4px';
          panel.style.padding = '6px';
          panel.style.fontSize = '10px';
          panel.style.boxSizing = 'border-box';
          row.after(panel);
          (panel as any)._render = renderFxPanel; // 再描画参照
          renderFxPanel();
        } else {
          if (panel.style.display === 'none') { panel.style.display = 'block'; renderFxPanel(); }
          else { panel.style.display = 'none'; }
        }
      });
      updateBtnCount();

      trackListDiv.appendChild(row);
    });

    // === Master Row 追加 ===
    const masterRow = document.createElement('div');
    masterRow.style.display = 'grid';
    masterRow.style.gridTemplateColumns = '70px 50px 24px 24px 1.6fr 46px';
    masterRow.style.alignItems = 'center';
    masterRow.style.columnGap = '4px';
    masterRow.style.marginTop = '10px';
    masterRow.style.padding = '5px 6px';
    masterRow.style.background = '#f0f4f8';
    masterRow.style.border = '1px solid #b5c3ce';
    masterRow.style.borderRadius = '4px';
    masterRow.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
    masterRow.dataset.trackId = 'master';

    const mName = document.createElement('span');
    mName.textContent = 'Master';
    mName.style.fontSize = '11px';
    mName.style.fontWeight = '700';
    masterRow.appendChild(mName);

    const mMeterCell = document.createElement('div');
    mMeterCell.style.display = 'flex';
    mMeterCell.style.flexDirection = 'column';
    mMeterCell.style.alignItems = 'stretch';
    const mMeterWrap = document.createElement('div');
    mMeterWrap.style.position = 'relative';
    mMeterWrap.style.width = '100%';
    mMeterWrap.style.height = '8px';
    mMeterWrap.style.background = '#223';
    mMeterWrap.style.borderRadius = '2px';
    const mMeterFill = document.createElement('div');
    mMeterFill.className = 'master-meter-fill';
    mMeterFill.style.position = 'absolute';
    mMeterFill.style.left = '0';
    mMeterFill.style.top = '0';
    mMeterFill.style.height = '100%';
    mMeterFill.style.width = '0%';
    mMeterFill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';
    mMeterWrap.appendChild(mMeterFill);
    mMeterCell.appendChild(mMeterWrap);
    const mLvl = document.createElement('span');
    mLvl.textContent = '-∞';
    mLvl.style.fontSize = '9px';
    mLvl.style.textAlign = 'center';
    mLvl.style.marginTop = '2px';
    mLvl.className = 'master-level-display';
    mMeterCell.appendChild(mLvl);
    masterRow.appendChild(mMeterCell);

    const mMute = document.createElement('button');
    mMute.textContent = '-';
    mMute.disabled = true; mMute.style.opacity = '0.4';
    mMute.style.fontSize = '10px'; mMute.style.padding = '3px 8px';
    masterRow.appendChild(mMute);
    const mSolo = document.createElement('button');
    mSolo.textContent = '-';
    mSolo.disabled = true; mSolo.style.opacity = '0.4';
    mSolo.style.fontSize = '10px'; mSolo.style.padding = '3px 8px';
    masterRow.appendChild(mSolo);

    const mVolWrap = document.createElement('div');
    mVolWrap.style.display = 'flex';
    mVolWrap.style.alignItems = 'center';
    mVolWrap.style.gap = '4px';
    const mVol = document.createElement('input');
    mVol.type = 'range'; mVol.min = '0'; mVol.max = '2'; mVol.step = '0.01';
    mVol.value = String(window.masterGainValue ?? 1);
    mVol.style.flex = '1'; mVol.style.cursor = 'pointer';
    const mVal = document.createElement('span');
    mVal.style.fontSize = '10px'; mVal.style.minWidth = '34px'; mVal.style.textAlign = 'center';
    const setMaster = (v: number) => {
      v = Math.min(2, Math.max(0, v));
      window.masterGainValue = v;
      mVol.value = String(v);
      mVal.textContent = (v * 100).toFixed(0);
      const toggleAudioCheckbox = document.getElementById('toggle-audio') as HTMLInputElement | null;
      if (window.outputGainNode && toggleAudioCheckbox && toggleAudioCheckbox.checked) {
        window.outputGainNode.gain.value = v;
      }
    };
    mVal.textContent = (parseFloat(mVol.value) * 100).toFixed(0);
    mVol.addEventListener('input', () => setMaster(parseFloat(mVol.value)));
    mVol.addEventListener('wheel', (e) => { e.preventDefault(); const d = e.deltaY < 0 ? 0.02 : -0.02; setMaster(parseFloat(mVol.value) + d); }, { passive: false });
    mVolWrap.appendChild(mVol); mVolWrap.appendChild(mVal);
    masterRow.appendChild(mVolWrap);

    const mFxCell = document.createElement('div');
    const mFxBtn = document.createElement('button');
    mFxBtn.style.fontSize = '10px'; mFxBtn.style.padding = '3px 6px';
    mFxBtn.style.cursor = 'pointer';
    const updateMasterFxCount = () => {
      const count = (window as any).busManager?.getEffectsChainMeta?.().length || 0;
      mFxBtn.textContent = 'FX(' + count + ')';
    };
    updateMasterFxCount();
    mFxCell.appendChild(mFxBtn);
    masterRow.appendChild(mFxCell);
    trackListDiv.appendChild(masterRow);

    // === Master FX Section (統合) ===
    let masterSection = document.getElementById('master-fx-section');
    if (!masterSection) {
      masterSection = document.createElement('div');
      masterSection.id = 'master-fx-section';
      masterSection.style.marginTop = '6px';
      masterSection.style.padding = '8px 10px';
      masterSection.style.background = '#f6f9fc';
      masterSection.style.border = '1px solid #c3d0db';
      masterSection.style.borderRadius = '6px';
      masterSection.style.fontSize = '11px';
      masterSection.style.display = 'none'; // 初期折り畳み
      masterSection.innerHTML = '<b style="font-size:12px;">Master Effects Chain</b><div style="font-size:10px;color:#567;margin-top:2px;">(Post Mix)</div>';
      const listWrap = document.createElement('div');
      listWrap.id = 'master-fx-list';
      listWrap.style.marginTop = '6px';
      masterSection.appendChild(listWrap);
      const ctrl = document.createElement('div');
      ctrl.style.display = 'flex'; ctrl.style.flexWrap = 'wrap'; ctrl.style.gap = '4px'; ctrl.style.marginTop = '8px';
      function mk(label: string, fn: () => void) { const b = document.createElement('button'); b.textContent = label; b.style.fontSize = '10px'; b.style.padding = '3px 6px'; b.addEventListener('click', fn); return b; }

      // 既存のネイティブエフェクト追加ボタン
      ctrl.appendChild(mk('+Gain', () => { enqueueMasterFx({ action: 'add', payload: { type: 'gain' } }); }));
      ctrl.appendChild(mk('+LPF', () => { enqueueMasterFx({ action: 'add', payload: { type: 'biquad' } }); }));
      ctrl.appendChild(mk('+Delay', () => { enqueueMasterFx({ action: 'add', payload: { type: 'delay' } }); }));

      // EffectRegistry v2 からカテゴリ別エフェクト追加ボタンを生成（動的更新）
      function refreshCategoryButtons() {
        // 既存のカテゴリボタンを削除
        const existingCategoryBtns = ctrl.querySelectorAll('[data-category-btn]');
        existingCategoryBtns.forEach(btn => btn.remove());

        const availableEffects = listRegisteredEffects();
        const categories = [...new Set(availableEffects.map(fx => fx.category))];

        console.log(`[Effects] Refreshing category buttons. Available effects: ${availableEffects.length}, Categories: ${categories.join(', ')}`);

        // カテゴリ別追加ボタン（EffectRegistry v2統合）
        categories.forEach(category => {
          const categoryEffects = availableEffects.filter(fx => fx.category === category);
          if (categoryEffects.length > 0) {
            const categoryBtn = mk(`+${category}`, async () => {
              // 複数エフェクトがある場合は最初のものを選択（将来的にはドロップダウン）
              const firstEffect = categoryEffects[0];
              console.log(`[Effects] Adding ${firstEffect.refId} (${category})`);

              // EffectRegistry v2のエフェクトをbusManagerに追加
              const busManager = (window as any).busManager;
              if (busManager && busManager.addEffectFromRegistry) {
                try {
                  await busManager.addEffectFromRegistry(firstEffect.refId);
                  console.log(`[Effects] Successfully added ${firstEffect.refId}`);
                } catch (error) {
                  console.error(`[Effects] Failed to add ${firstEffect.refId}:`, error);
                }
              } else {
                console.warn('[Effects] busManager not available or addEffectFromRegistry not implemented');
              }
            });
            categoryBtn.style.backgroundColor = getCategoryColor(category);
            categoryBtn.style.color = '#fff';
            categoryBtn.setAttribute('data-category-btn', 'true'); // 識別用

            // Clearボタンの直前に挿入
            const clearBtn = ctrl.querySelector('button:last-child');
            if (clearBtn) {
              ctrl.insertBefore(categoryBtn, clearBtn);
            } else {
              ctrl.appendChild(categoryBtn);
            }
          }
        });
      }

      // 初期ボタン生成
      refreshCategoryButtons();

      // EffectRegistry更新イベントリスナー
      document.addEventListener('effect-registry-updated', () => {
        console.log('[Effects] Registry updated, refreshing category buttons');
        refreshCategoryButtons();
      });

      ctrl.appendChild(mk('Clear', () => { enqueueMasterFx({ action: 'clear' }); }));

      ctrl.appendChild(mk('Clear', () => { enqueueMasterFx({ action: 'clear' }); }));
      masterSection.appendChild(ctrl);
      trackListDiv.appendChild(masterSection);

      // レンダリング関数
      function renderMasterFxChain() {
        updateMasterFxCount();
        const listDiv = document.getElementById('master-fx-list');
        if (!listDiv) return;
        listDiv.innerHTML = '';
        const items = (window as any).busManager?.getEffectsChainMeta?.() || [];
        if (!items.length) {
          const empty = document.createElement('div'); empty.textContent = '(empty)'; empty.style.fontSize = '10px'; empty.style.color = '#678'; listDiv.appendChild(empty); return;
        }
        items.forEach((it: any) => {
          const row = document.createElement('div');
          row.style.display = 'grid';
          row.style.gridTemplateColumns = '1fr auto auto auto auto';
          row.style.alignItems = 'center';
          row.style.columnGap = '4px';
          row.style.marginTop = '4px';
          row.style.background = '#fff';
          row.style.border = '1px solid #ccd5dd';
          row.style.borderRadius = '4px';
          row.style.padding = '4px 6px';
          row.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';

          // EffectRegistry v2対応: refIdがある場合は詳細表示
          const displayName = it.refId ? `${it.index + 1}. ${it.refId}` : `${it.index + 1}. ${it.type}`;
          const name = document.createElement('span');
          name.textContent = displayName;
          name.style.fontWeight = '600';
          name.style.fontSize = '10px';

          // カテゴリ色分け対応
          if (it.refId) {
            const registryEffect = listRegisteredEffects().find(fx => fx.refId === it.refId);
            if (registryEffect) {
              const color = getCategoryColor(registryEffect.category);
              name.style.borderLeft = `3px solid ${color}`;
              name.style.paddingLeft = '6px';
              name.title = `${registryEffect.label} (${registryEffect.category})`;
            }
          }

          row.appendChild(name);
          const bypassBtn = document.createElement('button'); bypassBtn.textContent = it.bypass ? 'Byp' : 'On'; bypassBtn.style.fontSize = '9px'; bypassBtn.style.padding = '2px 5px'; bypassBtn.addEventListener('click', () => { enqueueMasterFx({ action: 'bypass', payload: { id: it.id } }); }); row.appendChild(bypassBtn);
          const upBtn = document.createElement('button'); upBtn.textContent = '↑'; upBtn.style.fontSize = '9px'; upBtn.style.padding = '2px 4px'; upBtn.disabled = it.index === 0; upBtn.addEventListener('click', () => { enqueueMasterFx({ action: 'move', payload: { id: it.id, newIndex: it.index - 1 } }); }); row.appendChild(upBtn);
          const downBtn = document.createElement('button'); downBtn.textContent = '↓'; downBtn.style.fontSize = '9px'; downBtn.style.padding = '2px 4px'; downBtn.disabled = it.index === items.length - 1; downBtn.addEventListener('click', () => { enqueueMasterFx({ action: 'move', payload: { id: it.id, newIndex: it.index + 1 } }); }); row.appendChild(downBtn);
          const rmBtn = document.createElement('button'); rmBtn.textContent = '✕'; rmBtn.style.fontSize = '9px'; rmBtn.style.padding = '2px 4px'; rmBtn.addEventListener('click', () => { enqueueMasterFx({ action: 'remove', payload: { id: it.id } }); }); row.appendChild(rmBtn);
          listDiv.appendChild(row);
        });
      }
      document.addEventListener('effects-chain-changed', renderMasterFxChain);
      renderMasterFxChain();

      // ボタン折り畳み連動
      mFxBtn.addEventListener('click', () => {
        if (!masterSection) return;
        const visible = masterSection.style.display !== 'none';
        masterSection.style.display = visible ? 'none' : 'block';
        if (!visible) renderMasterFxChain();
      });
    } else {
      // 既存セクションがある場合はカウント更新とボタンリスナー再付与 (再レンダー時)
      mFxBtn.addEventListener('click', () => {
        const visible = masterSection!.style.display !== 'none';
        masterSection!.style.display = visible ? 'none' : 'block';
      });
      updateMasterFxCount();
    }
  }
  document.addEventListener('tracks-changed', renderTrackList);
  document.addEventListener('track-volume-changed', (e: any) => {
    const { id, vol } = e.detail || {}; // 再レンダー無で反映
    const slider = trackListDiv.querySelector(`input[type="range"][data-track-id="${id}"]`) as HTMLInputElement | null;
    const valSpan = slider?.parentElement?.querySelector('span') as HTMLSpanElement | null;
    if (slider) slider.value = String(vol);
    if (valSpan) valSpan.textContent = (vol * 100).toFixed(0);
  });
  renderTrackList();

  // EffectRegistry v2: カテゴリ別色分け関数
  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'source': '#22c55e',    // 緑 - 音源
      'effect': '#3b82f6',    // 青 - エフェクト
      'hybrid': '#8b5cf6',    // 紫 - ハイブリッド
      'utility': '#6b7280'    // 灰 - ユーティリティ
    };
    return colors[category] || '#6b7280';
  }

  // === Effects Chain GUI (MVP) === (旧: 独立パネル) は Track リスト統合済みのため削除
  // 旧コードで fxPanel / fxList / addGainBtn などを生成していたブロックを除去。
  // Audio Output: OFF (master mute) 中でも busManager へ addEffect は可能 (gain=0 でもチェーン構築される)。
  // レベルメータ更新ループ (Track + Master)
  function updateMeters() {
    if ((window as any).audioCtx) {
      const ctx: AudioContext = (window as any).audioCtx;
      const levels = getTrackLevels(ctx);
      levels.forEach(l => {
        const el = trackListDiv.querySelector(`.track-meter-fill[data-track-id="${l.id}"]`) as HTMLDivElement | null;
        const lvlText = trackListDiv.querySelector(`span[data-level-track-id="${l.id}"]`) as HTMLSpanElement | null;
        if (el) {
          const pct = (l.level * 100).toFixed(1) + '%';
          el.style.width = pct;
          if (l.level > 0.85) el.style.background = 'linear-gradient(90deg,#f42,#a00)';
          else if (l.level > 0.6) el.style.background = 'linear-gradient(90deg,#fd4,#a60)';
          else el.style.background = 'linear-gradient(90deg,#3fa,#0f5)';
        }
        if (lvlText) {
          if (l.level < 0.0005) lvlText.textContent = '-∞';
          else {
            // 簡易dB換算 (20*log10(level))
            const db = 20 * Math.log10(Math.max(l.level, 1e-5));
            lvlText.textContent = db.toFixed(1);
          }
        }
      });

      // Master メータ (outputGainNode の直前で測定) - 改良版
      const masterFill = trackListDiv.querySelector('.master-meter-fill') as HTMLDivElement | null;
      const masterLevel = trackListDiv.querySelector('.master-level-display') as HTMLSpanElement | null;
      if (masterFill && masterLevel && (window as any).outputGainNode) {
        const outputGain = (window as any).outputGainNode as GainNode;

        // 永続的なAnalyserNodeを作成（まだ存在しない場合）
        if (!(window as any).masterAnalyser) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          (window as any).masterAnalyser = analyser;
          (window as any).masterAnalyserData = new Uint8Array(analyser.frequencyBinCount);

          // outputGainNodeから永続的に接続
          try {
            outputGain.connect(analyser);
            console.log('[Audio] Master analyser connected to outputGainNode');
          } catch (error) {
            console.warn('[Audio] Failed to connect master analyser:', error);
          }
        }

        const analyser = (window as any).masterAnalyser;
        const dataArray = (window as any).masterAnalyserData;

        if (analyser && dataArray) {
          try {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const level = Math.min(1, average / 255);

            const pct = (level * 100).toFixed(1) + '%';
            masterFill.style.width = pct;
            if (level > 0.7) masterFill.style.background = 'linear-gradient(90deg,#f42,#a00)';
            else if (level > 0.4) masterFill.style.background = 'linear-gradient(90deg,#fd4,#a60)';
            else masterFill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';

            if (level < 0.001) masterLevel.textContent = '-∞';
            else {
              const db = 20 * Math.log10(Math.max(level, 1e-5));
              masterLevel.textContent = db.toFixed(1);
            }
          } catch (error) {
            // エラー時はメーターを非表示にする
            masterFill.style.width = '0%';
            masterLevel.textContent = 'ERR';
          }
        }
      }
    }
    requestAnimationFrame(updateMeters);
  }
  requestAnimationFrame(updateMeters);
  logStatus("DOMContentLoaded");  // === Visualizer display control logic - TAURI WINDOW VERSION ===
  logStatus("[DEBUG] Starting Visualizer setup...");
  const visualizerIds = ["visualizer1", "visualizer2", "visualizer3"];
  logStatus(`[DEBUG] Visualizer IDs: ${visualizerIds.join(", ")}`);
  // Visualizerウィンドウの参照を保存
  const visualizerWindows: { [key: string]: any } = {};
  // Tauri APIが利用可能かチェック
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

  // Device permission request before getting device list
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    logStatus("Microphone permission denied: " + (e as Error).message);
  }

  // Device selector initialization
  async function updateDeviceLists() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputSel = document.getElementById("output-device") as HTMLSelectElement;
    const inputSel = document.getElementById("input-device") as HTMLSelectElement;
    if (outputSel) {
      outputSel.innerHTML = "";
      devices.filter(d => d.kind === "audiooutput").forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Output Device (${d.deviceId})`;
        outputSel.appendChild(opt);
      });
    }
    if (inputSel) {
      inputSel.innerHTML = "";
      devices.filter(d => d.kind === "audioinput").forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Input Device (${d.deviceId})`;
        inputSel.appendChild(opt);
      });
    }
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

  // Output device switching (AudioContext direct connection not supported. Only available through audio tags with setSinkId)
  const outputSel = document.getElementById("output-device") as HTMLSelectElement;
  if (outputSel) {
    outputSel.addEventListener("change", async () => {
      const deviceId = outputSel.value;
      // Example: using audio tag
      // const audio = document.getElementById("your-audio-tag-id") as HTMLAudioElement;
      // if (audio && audio.setSinkId) await audio.setSinkId(deviceId);
      logStatus(`Output device switched: ${deviceId} (AudioContext direct connection not supported)`);
    });
  }

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

  // Audio初期化時にも自動UIを生成
  async function initAudioAndRenderUI() {
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

    // Phase 2: Faust DSP 適用
    await applyFaustDSP();

    // Step1: Trackラップ
    if (window.faustNode && window.audioCtx) {
      if (!listTracks().some(t => t.inputNode === window.faustNode)) {
        const track = createTrackEnvironment(window.audioCtx, window.faustNode);
        // busManager が既に存在する場合 master bus へ接続 (createTrackEnvironment 内でも試行)
        if ((window as any).busManager?.getEffectsInputNode) {
          try { track.volumeGain.disconnect(); } catch { }
          try { track.volumeGain.connect((window as any).busManager.getEffectsInputNode()); } catch { }
        }
      }
    }
    await renderFaustParams();
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
      await initAudioAndRenderUI();
      logStatus("DSP reapplication completed");
    } catch (e) {
      logStatus("DSP reapplication error: " + (e as Error).message);
    }
  });

  // テストボタンコンテナを作成（改行対応）
  let testButtonContainer = document.getElementById("test-button-container");
  if (!testButtonContainer) {
    testButtonContainer = document.createElement("div");
    testButtonContainer.id = "test-button-container";
    testButtonContainer.style.marginBottom = "10px";
    testButtonContainer.style.display = "flex";
    testButtonContainer.style.flexWrap = "wrap";
    testButtonContainer.style.gap = "6px";
    testButtonContainer.style.maxWidth = "calc(100% - 320px)"; // Logic Inputsの幅(280px + margin)を考慮して広く
    testButtonContainer.style.paddingRight = "10px"; // 右端に余白
    document.body.insertBefore(testButtonContainer, document.querySelector(".visualizer-controls"));
  }

  // Base Audio Only 初期化ボタン (Test Signal用)
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
    baseAudioBtn.title = "Initialize audio engine for test signals (without DSP)";
    testButtonContainer.appendChild(baseAudioBtn);
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

    const applyAudioOutputState = async (checked: boolean) => {
      try {
        if (checked) {
          // Audio Output ONの場合、必要に応じてAudio Engineも自動起動
          if (!window.audioCtx) {
            console.log("[AudioOutput] Starting Audio Engine automatically...");
            await initAudioAndRenderUI();
          } else if (window.audioCtx.state !== "running") {
            console.log("[AudioOutput] Resuming Audio Engine...");
            await resumeAudio();
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

  // === 入出力デバイスの簡易リスト（旧UI残骸簡略化） ===
  const ioDiv = document.getElementById("io-status-panel") || document.createElement("div");
  ioDiv.id = "io-status-panel";
  ioDiv.style.position = "fixed";
  ioDiv.style.right = "16px";
  ioDiv.style.top = "16px";
  ioDiv.style.background = "#f0f0f0";
  ioDiv.style.border = "1px solid #ccc";
  ioDiv.style.padding = "8px";
  ioDiv.style.zIndex = "800";
  ioDiv.style.fontSize = "12px";
  function updateIoStatusPanel() {
    ioDiv.innerHTML = `<b>Devices</b><br>`;
    const inputs = deviceDiscovery.listInputs();
    inputs.forEach(d => { ioDiv.innerHTML += `${d.label}<br>`; });
  }
  updateIoStatusPanel();
  if (!document.getElementById("io-status-panel")) document.body.appendChild(ioDiv);
  document.addEventListener('audio-devices-updated', updateIoStatusPanel);
  // 旧 micRouting / レイアウト調整コード除去済み

  let nameEditGuard = false; // 双方向ループ防止
  function beginEditTrackName(trackId: string, labelEl: HTMLSpanElement) {
    if (labelEl.dataset.editing === '1') return;
    labelEl.dataset.editing = '1';
    const orig = labelEl.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = orig;
    input.style.fontSize = labelEl.style.fontSize;
    input.style.width = Math.max(60, orig.length * 8) + 'px';
    input.style.border = '1px solid #4a90e2';
    input.style.borderRadius = '3px';
    input.style.padding = '1px 3px';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    labelEl.replaceWith(input);
    input.focus();
    input.select();
    function finish(apply: boolean) {
      if (!apply) {
        input.replaceWith(labelEl);
        labelEl.dataset.editing = '';
        return;
      }
      const newName = input.value.trim() || orig;
      input.replaceWith(labelEl);
      labelEl.dataset.editing = '';
      if (newName !== orig) {
        nameEditGuard = true;
        (window as any).trackAPI?.setName?.(trackId, newName);
        // LogicInput側更新: trackId一致するLogicInputを探索
        const lim: any = (window as any).logicInputManagerInstance;
        if (lim) {
          const li = lim.list().find((l: any) => l.trackId === trackId);
          if (li) lim.setLabel(li.id, newName);
        }
        nameEditGuard = false;
      }
      labelEl.textContent = newName;
    }
  }

  // Track名変更APIをwindowに公開
  (window as any).trackAPI = (window as any).trackAPI || {};
  (window as any).trackAPI.setName = (id: string, name: string) => {
    if ((window as any).setTrackName) {
      (window as any).setTrackName(id, name);
    } else {
      // fallback: tracks.ts のエクスポートへアクセス可能にするため、後でbind
      document.dispatchEvent(new CustomEvent('track-name-changed', { detail: { id, name } }));
    }
  };
  ; (window as any).logicInputManagerInstance = logicInputManager;

  document.addEventListener('track-name-changed', (e: any) => {
    if (nameEditGuard) return;
    const { id, name } = e.detail || {};
    // DOM更新
    const rows = trackListDiv.querySelectorAll('div');
    rows.forEach(r => {
      const span = r.querySelector('span');
      if (span && span.textContent === id) {
        span.textContent = name;
      }
    });
  });

  document.addEventListener('logic-input-label-changed', (e: any) => {
    if (nameEditGuard) return;
    const { id, label } = e.detail || {};
    // labelに対応するtrackIdを調べる
    const li = logicInputManager.list().find(l => l.id === id);
    if (li && li.trackId) {
      (window as any).trackAPI?.setName?.(li.trackId, label);
    }
  });

  // LogicInput削除時 Track自動dispose 設定
  logicInputManager.setTrackDisposer((trackId: string) => {
    if ((window as any).disposeTrack) {
      (window as any).disposeTrack(trackId);
    } else {
      // 動的 import fallback
      try {
        // no-op: ビルド時に結合される想定
      } catch { }
    }
  });

  // LogicInput削除APIをwindowに公開
  (window as any).logicInputAPI = (window as any).logicInputAPI || {};
  (window as any).logicInputAPI.remove = (id: string) => logicInputManager.remove(id);

  // === EffectRegistry: 最小 fxAPI 公開 (後で Track/Bus 統合) ===
  (window as any).fxAPI = (window as any).fxAPI || {};
  (window as any).fxAPI.list = () => listRegisteredEffects();
  (window as any).fxAPI.addEffect = async (refId: string) => {
    const busManager = (window as any).busManager;
    if (busManager && busManager.addEffectFromRegistry) {
      try {
        const item = await busManager.addEffectFromRegistry(refId);
        console.log(`[fxAPI] Added effect: ${refId}`, item);

        // 音量診断
        const outputGain = window.outputGainNode;
        if (outputGain) {
          console.log(`[fxAPI] Current output gain after adding ${refId}:`, outputGain.gain.value);
        }

        return item;
      } catch (error) {
        console.error(`[fxAPI] Failed to add effect ${refId}:`, error);
        throw error;
      }
    } else {
      throw new Error('[fxAPI] busManager not available');
    }
  };

  // 診断機能を追加
  (window as any).fxAPI.diagnose = () => {
    const busManager = (window as any).busManager;
    if (!busManager) {
      console.log('[fxAPI.diagnose] busManager not available');
      return;
    }

    console.log('\n=== Audio Chain Diagnostic ===');

    // エフェクトチェーン情報
    const chain = busManager.getEffectsChainMeta ? busManager.getEffectsChainMeta() : [];
    console.log('Effects Chain:', chain);

    // 重複チェック
    const refIds = chain.map((item: any) => item.refId).filter(Boolean);
    const duplicates = refIds.filter((id: string, index: number) => refIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      console.warn('⚠️ Duplicate effect instances found:', duplicates);
    }

    // 音量情報
    const outputGain = (window as any).outputGainNode;
    if (outputGain) {
      console.log('Output Gain Node:', outputGain.gain.value);
    }

    // AudioContext情報
    if (audioCtx) {
      console.log('AudioContext state:', audioCtx.state);
      console.log('AudioContext sample rate:', audioCtx.sampleRate);
    }

    console.log('=== End Diagnostic ===\n');
  };

  // 強制クリーンアップ機能
  (window as any).fxAPI.cleanup = () => {
    const busManager = (window as any).busManager;
    if (busManager && busManager.clearEffectsChain) {
      busManager.clearEffectsChain();
      console.log('[fxAPI] Effects chain cleared');
    }
  };

  // 診断API の公開
  (window as any).trackDiagnose = async (id?: string) => {
    const { diagnoseTrackVolume } = await import('./audio/tracks');
    diagnoseTrackVolume(id);
  };
  (window as any).trackReset = async (id: string) => {
    const { resetTrackVolume } = await import('./audio/tracks');
    return resetTrackVolume(id);
  };
  (window as any).trackRebuild = async (id: string) => {
    const { rebuildTrackChain } = await import('./audio/tracks');
    return rebuildTrackChain(id);
  };
  (window as any).fxAPI.preloadAll = async () => {
    if (!window.audioCtx) {
      console.warn('[fxAPI] audioCtx 未初期化。initAudio 実行後に再試行');
      return;
    }
    await preloadAllEffects(window.audioCtx);
    console.log('[fxAPI] preloadAll 完了');
  };
  (window as any).fxAPI.createInstance = async (refId: string) => {
    if (!window.audioCtx) throw new Error('audioCtx 未初期化');
    const inst = await createEffectInstance(refId, window.audioCtx);
    console.log('[fxAPI] created', inst);
    // まだ Bus/Track チェーンへは接続しない (後続ステップで RebuildManager 経由で組み込む)
    return { id: inst.id, refId: inst.refId, kind: inst.kind, bypass: inst.bypass, params: inst.controller?.listParams?.() };
  };
  // 便宜: 起動時に一覧をログ
  console.log('[fxAPI] Registered Effects:', (window as any).fxAPI.list());

  // trackFxAPI: per-track insert FX チェーン操作 (暫定UI未実装)
  (window as any).trackFxAPI = (window as any).trackFxAPI || {};
  (window as any).trackFxAPI.add = (trackId: string, refId: string) => addTrackEffect(trackId, refId);
  (window as any).trackFxAPI.remove = (effectId: string) => removeTrackEffect(effectId);
  (window as any).trackFxAPI.toggleBypass = (effectId: string) => toggleTrackEffectBypass(effectId);
  (window as any).trackFxAPI.move = (trackId: string, effectId: string, newIndex: number) => moveTrackEffect(trackId, effectId, newIndex);
  (window as any).trackFxAPI.list = (trackId: string) => listTrackEffectsMeta(trackId);
  document.addEventListener('track-effects-changed', (e: any) => { console.log('[track-effects-changed]', e.detail); });

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