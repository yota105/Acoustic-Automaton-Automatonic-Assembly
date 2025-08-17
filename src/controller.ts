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
import { listRegisteredEffects, preloadAll as preloadAllEffects, createEffectInstance } from './audio/effects/effectRegistry';
import { addTrackEffect, removeTrackEffect, toggleTrackEffectBypass, moveTrackEffect, listTrackEffectsMeta } from './audio/tracks';

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
  logicPanel.style.minWidth = '320px';
  logicPanel.style.background = '#f8faff';
  logicPanel.style.border = '1px solid #c3d4e6';
  logicPanel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
  logicPanel.style.borderRadius = '6px';
  logicPanel.style.padding = '12px 14px';
  logicPanel.style.zIndex = '1200';
  logicPanel.style.fontSize = '13px';
  logicPanel.innerHTML = '<b style="font-size:14px;">Logic Inputs / Routing</b><div style="font-size:11px;color:#567;margin-top:2px;">Assignment / Devices included</div>';
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
  trackListDiv.style.padding = '10px 12px';
  trackListDiv.style.fontSize = '12px';
  trackListDiv.style.width = '420px'; // 340px → 420px に拡大
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
      ctrl.appendChild(mk('+Gain', () => { enqueueMasterFx({ action: 'add', payload: { type: 'gain' } }); }));
      ctrl.appendChild(mk('+LPF', () => { enqueueMasterFx({ action: 'add', payload: { type: 'biquad' } }); }));
      ctrl.appendChild(mk('+Delay', () => { enqueueMasterFx({ action: 'add', payload: { type: 'delay' } }); }));
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
          const name = document.createElement('span'); name.textContent = `${it.index + 1}. ${it.type}`; name.style.fontWeight = '600'; name.style.fontSize = '10px'; row.appendChild(name);
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

      // Master メータ (outputGainNode の直前で測定)
      const masterFill = trackListDiv.querySelector('.master-meter-fill') as HTMLDivElement | null;
      const masterLevel = trackListDiv.querySelector('.master-level-display') as HTMLSpanElement | null;
      if (masterFill && masterLevel && (window as any).outputGainNode) {
        const outputGain = (window as any).outputGainNode as GainNode;
        try {
          // 一時的に analyser を outputGainNode に接続
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          const tmp = new Uint8Array(256);
          outputGain.connect(analyser);
          analyser.getByteTimeDomainData(tmp);
          let sum = 0;
          for (let i = 0; i < tmp.length; i++) {
            const v = (tmp[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / tmp.length);
          const level = Math.min(1, Math.pow(rms, 0.5));

          const pct = (level * 100).toFixed(1) + '%';
          masterFill.style.width = pct;
          if (level > 0.85) masterFill.style.background = 'linear-gradient(90deg,#f42,#a00)';
          else if (level > 0.6) masterFill.style.background = 'linear-gradient(90deg,#fd4,#a60)';
          else masterFill.style.background = 'linear-gradient(90deg,#3fa,#0f5)';

          if (level < 0.0005) masterLevel.textContent = '-∞';
          else {
            const db = 20 * Math.log10(Math.max(level, 1e-5));
            masterLevel.textContent = db.toFixed(1);
          }

          outputGain.disconnect(analyser);
        } catch { /* ignore analyser connection errors */ }
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

  // Base Audio Only 初期化ボタン (Test Signal用)
  let baseAudioBtn = document.getElementById("base-audio-btn") as HTMLButtonElement;
  if (!baseAudioBtn) {
    baseAudioBtn = document.createElement("button");
    baseAudioBtn.id = "base-audio-btn";
    baseAudioBtn.textContent = "🔊 Enable Test Signals";
    baseAudioBtn.style.marginLeft = "8px";
    baseAudioBtn.style.backgroundColor = "#e8f5e8";
    baseAudioBtn.style.border = "1px solid #4a9";
    baseAudioBtn.style.borderRadius = "4px";
    baseAudioBtn.style.padding = "6px 12px";
    baseAudioBtn.style.fontWeight = "bold";
    baseAudioBtn.title = "Initialize audio engine for test signals (without DSP)";
    document.body.insertBefore(baseAudioBtn, document.querySelector(".visualizer-controls"));
  }
  baseAudioBtn.addEventListener("click", async () => {
    logStatus("Base Audio initialization: AudioContext + TestSignalManager ready");
    try {
      await ensureBaseAudio();
      baseAudioBtn.textContent = "✅ Test Signals Ready";
      baseAudioBtn.style.backgroundColor = "#d4edda";
      baseAudioBtn.style.borderColor = "#28a745";
      baseAudioBtn.disabled = true;
      logStatus("Base Audio initialization completed - Test signals now available");

      // 直接音声テスト追加
      if (window.audioCtx && window.outputGainNode) {
        const testBtn = document.createElement("button");
        testBtn.textContent = "🔊 Direct Audio Test";
        testBtn.style.marginLeft = "8px";
        testBtn.style.backgroundColor = "#fff3cd";
        testBtn.style.border = "1px solid #ffeaa7";
        testBtn.style.borderRadius = "4px";
        testBtn.style.padding = "4px 8px";
        testBtn.title = "Test direct audio output bypassing Logic Inputs";

        testBtn.addEventListener("click", () => {
          const ctx = window.audioCtx!;
          const output = window.outputGainNode!;

          // 短いビープ音を直接出力に接続
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.frequency.value = 1000; // 1kHz
          osc.type = 'sine';

          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
          gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.09);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);

          osc.connect(gain);
          gain.connect(output);

          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.1);

          console.log(`[DirectTest] Output gain: ${output.gain.value}, AudioContext: ${ctx.state}`);
        });

        baseAudioBtn.parentElement?.appendChild(testBtn);
      }
    } catch (e) {
      logStatus("Base Audio initialization error: " + (e as Error).message);
      baseAudioBtn.textContent = "❌ Failed - Retry";
      baseAudioBtn.style.backgroundColor = "#f8d7da";
      baseAudioBtn.style.borderColor = "#dc3545";
    }
  });

  // Audio Engine ON/OFF Toggle Switch (replaces Start/Stop buttons)
  const toggleEngine = document.getElementById("toggle-engine");
  const toggleEngineLabel = document.getElementById("toggle-engine-label");
  if (toggleEngine instanceof HTMLInputElement && toggleEngineLabel instanceof HTMLSpanElement) {
    // 初期表示
    toggleEngine.checked = false;
    toggleEngineLabel.textContent = "Audio Engine: OFF";

    const applyEngineState = async (checked: boolean) => {
      try {
        if (checked) {
          if (!window.audioCtx) {
            await initAudioAndRenderUI();
          } else if (window.audioCtx.state !== "running") {
            await resumeAudio();
          }
          toggleEngineLabel.textContent = "Audio Engine: ON";
        } else {
          await suspendAudio();
          toggleEngineLabel.textContent = "Audio Engine: OFF";
        }
      } catch (e) {
        logStatus("Engine toggle error: " + (e as Error).message);
        // 失敗時は元に戻す
        toggleEngine.checked = !checked;
      }
    };

    toggleEngine.addEventListener("change", () => {
      applyEngineState(toggleEngine.checked);
    });
  }

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

  // Audio Output ON/OFF Toggle Switch
  const toggleAudioCheckbox = document.getElementById("toggle-audio");
  const toggleAudioLabel = document.getElementById("toggle-audio-label");
  logStatus(`[DEBUG] toggleAudioCheckbox: ${!!toggleAudioCheckbox}, toggleAudioLabel: ${!!toggleAudioLabel}`);
  if (toggleAudioCheckbox instanceof HTMLInputElement && toggleAudioLabel instanceof HTMLSpanElement) {
    // Initial state: OFF
    toggleAudioCheckbox.checked = false;
    toggleAudioLabel.textContent = "Audio Output: OFF";

    // Update label based on checkbox state only
    const updateAudioLabel = () => {
      toggleAudioLabel.textContent = toggleAudioCheckbox.checked ? "Audio Output: ON" : "Audio Output: OFF";
      logStatus(`[DEBUG] Audio output: ${toggleAudioCheckbox.checked ? "ON" : "OFF"}`);
    };

    toggleAudioCheckbox.addEventListener("change", () => {
      updateAudioLabel();
      // GainNode value is managed by audioCore.ts updateOutputGain()
      // Don't interfere with other event listeners
    });

    updateAudioLabel();
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