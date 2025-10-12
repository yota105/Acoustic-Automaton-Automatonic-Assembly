import { listTracks, toggleMute, toggleSolo, setTrackVolume, addTrackEffect, removeTrackEffect, toggleTrackEffectBypass, moveTrackEffect, listTrackEffectsMeta, getTrackLevels } from '../engine/audio/core/tracks';
import { InputManager } from '../engine/audio/devices/inputManager';
import { LogicInputManager } from '../engine/audio/core/logicInputs';
import { DeviceAssignmentUI } from '../engine/audio/devices/deviceAssignment';
import { RoutingUI } from '../engine/audio/devices/routingUI';
import { PhysicalDevicePanel } from '../engine/audio/devices/physicalDevicePanel';
import { DeviceDiscovery } from '../engine/audio/devices/deviceDiscovery';
import { listRegisteredEffects, preloadAll as preloadAllEffects, createEffectInstance } from '../engine/audio/effects/effectRegistry';

export interface AudioPanelSetupOptions {
  enqueueMasterFx: (job: { action: 'add' | 'remove' | 'move' | 'bypass' | 'clear'; payload?: any }) => void;
}

export interface AudioPanelSetupResult {
  logicInputManager: LogicInputManager;
}

export async function setupAudioControlPanels({ enqueueMasterFx }: AudioPanelSetupOptions): Promise<AudioPanelSetupResult> {
  const logicInputManager = new LogicInputManager();

  const currentInputs = logicInputManager.list();
  const hasOldInstruments = currentInputs.some(input =>
    input.label === 'Vocal' || input.label === 'Guitar'
  );

  if (hasOldInstruments) {
    console.log('🎺 Migrating from Vocal/Guitar to Horn/Trombone setup');
    currentInputs.forEach(input => {
      if (input.label === 'Vocal' || input.label === 'Guitar') {
        logicInputManager.remove(input.id);
      }
    });
  }

  if (logicInputManager.list().length === 0) {
    logicInputManager.add({ label: 'Horn 1', assignedDeviceId: null, routing: { synth: true, effects: true, monitor: true }, gain: 1.0 });
    logicInputManager.add({ label: 'Horn 2', assignedDeviceId: null, routing: { synth: true, effects: true, monitor: true }, gain: 1.0 });
    logicInputManager.add({ label: 'Trombone', assignedDeviceId: null, routing: { synth: true, effects: true, monitor: true }, gain: 1.0 });
  }

  const deviceDiscovery = new DeviceDiscovery();
  await deviceDiscovery.enumerate();

  async function getPhysicalDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('[getPhysicalDevices] enumerateDevices not available, using fallback');
        return deviceDiscovery.listInputs().map(d => ({ id: d.id, label: d.label, enabled: d.enabled }));
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      console.log('[getPhysicalDevices] Found audio input devices:', audioInputs.length);

      const im = (window as any).inputManager;
      const activeMics = im && im.getMicInputStatus ? im.getMicInputStatus() : [];
      const activeMicIds = new Set(activeMics.map((mic: any) => mic.deviceId || mic.id));

      const result = audioInputs.map(device => ({
        id: device.deviceId,
        label: device.label || `マイク (${device.deviceId.slice(0, 8)}...)`,
        enabled: activeMicIds.has(device.deviceId)
      }));

      const hasDefault = result.some(d => d.id === 'default');
      if (!hasDefault) {
        result.unshift({
          id: 'default',
          label: 'デフォルトマイク',
          enabled: activeMicIds.has('default')
        });
      }

      console.log('[getPhysicalDevices] Returning devices:', result);
      return result;

    } catch (error) {
      console.error('[getPhysicalDevices] Error enumerating devices:', error);
      console.log('[getPhysicalDevices] Fallback to DeviceDiscovery');
      return deviceDiscovery.listInputs().map(d => ({ id: d.id, label: d.label, enabled: d.enabled }));
    }
  }

  const logicPanel = document.createElement('div');
  logicPanel.id = 'logic-input-panel';
  logicPanel.style.position = 'fixed';
  logicPanel.style.right = '16px';
  logicPanel.style.top = '16px';
  logicPanel.style.maxHeight = '60vh';
  logicPanel.style.overflowY = 'auto';
  logicPanel.style.width = '380px';
  logicPanel.style.background = '#f8faff';
  logicPanel.style.border = '1px solid #c3d4e6';
  logicPanel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
  logicPanel.style.borderRadius = '6px';
  logicPanel.style.padding = '10px 12px';
  logicPanel.style.zIndex = '1200';
  logicPanel.style.fontSize = '12px';
  logicPanel.innerHTML = '<b style="font-size:13px;">Logic Inputs / Routing</b><div style="font-size:10px;color:#567;margin-top:2px;">Assignment / Devices included</div>';
  document.body.appendChild(logicPanel);

  const assignDiv = document.createElement('div');
  assignDiv.style.marginTop = '4px';
  logicPanel.appendChild(assignDiv);
  const deviceAssignUI = new DeviceAssignmentUI(logicInputManager, getPhysicalDevices, assignDiv);
  await deviceAssignUI.render();

  const routingDiv = document.createElement('div');
  routingDiv.style.marginTop = '8px';
  logicPanel.appendChild(routingDiv);
  const routingUI = new RoutingUI(logicInputManager, routingDiv);
  routingUI.render();

  document.addEventListener('logic-input-assignment-changed', async () => {
    routingUI.render();
    updateUnassignedWarning();
  });

  document.addEventListener('mic-devices-updated', async () => {
    console.log('[Controller] Mic devices updated, refreshing UI');
    await deviceAssignUI.render();
    routingUI.render();
  });

  const deviceDiv = document.createElement('div');
  deviceDiv.style.marginTop = '8px';
  logicPanel.appendChild(deviceDiv);
  const devicePanel = new PhysicalDevicePanel(getPhysicalDevices, deviceDiv);
  await devicePanel.render();

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

  if (!(window as any).audioCtx) {
    const AC = window.AudioContext || (window as any)['webkitAudioContext'];
    (window as any).audioCtx = new AC();
  }
  if (!(window as any).inputManager) {
    (window as any).inputManager = new InputManager();
  }
  const audioCtx = (window as any).audioCtx;
  const inputManager = (window as any).inputManager;

  (window as any).audioAPI = {
    listTracks,
    createVirtualMicTrack: (id: string, label: string) => { inputManager.createVirtualMicTrack(audioCtx, id, label); },
    removeVirtualMicTrack: (id: string) => { inputManager.removeVirtualMicTrack(id); },
    listVirtualMicTracks: () => { return inputManager.listVirtualMicTracks(); },
    assignMicTrackRouting: (micId: string, destinations: { synth: boolean; effects: boolean; monitor: boolean }, gain: number = 1.0) => { inputManager.assignMicTrackRouting(micId, destinations, gain); },
    testVirtualMicTrack: (id: string) => {
      const v = inputManager.listVirtualMicTracks().find((t: any) => t.id === id);
      if (v && audioCtx) {
        const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; ++i) data[i] = (Math.random() * 2 - 1) * 0.2;
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(v.gainNode);
        src.start();
        src.stop(audioCtx.currentTime + 0.2);
        src.onended = () => src.disconnect();
      }
    },
  };

  const trackListDiv = document.createElement('div');
  trackListDiv.id = 'track-list-panel';
  trackListDiv.style.position = 'fixed';
  trackListDiv.style.right = '16px';
  trackListDiv.style.bottom = '16px';
  trackListDiv.style.background = '#eef4fa';
  trackListDiv.style.border = '1px solid #9ab';
  trackListDiv.style.borderRadius = '6px';
  trackListDiv.style.padding = '8px 10px';
  trackListDiv.style.fontSize = '11px';
  trackListDiv.style.width = '380px';
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
      row.style.gridTemplateColumns = '65px 46px 24px 24px 1.4fr 42px';
      row.style.alignItems = 'center';
      row.style.columnGap = '3px';
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
      vol.dataset.trackId = t.id;

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

      vol.addEventListener('input', (e) => {
        e.stopPropagation();
        updateVolume(parseFloat(vol.value));
      });

      vol.addEventListener('change', (e) => {
        e.stopPropagation();
        updateVolume(parseFloat(vol.value));
      });

      vol.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.005 : -0.005;
        updateVolume(parseFloat(vol.value) + delta);
      }, { passive: false });

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
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') finishEdit();
          if (ev.key === 'Escape') {
            valSpan.style.display = 'block';
            input.remove();
          }
          ev.stopPropagation();
        });

        valSpan.style.display = 'none';
        valSpan.parentElement?.insertBefore(input, valSpan);
        input.focus();
        input.select();
      });

      if (!(window as any).trackVolumeAPI) {
        (window as any).trackVolumeAPI = {};
      }
      (window as any).trackVolumeAPI[t.id] = updateVolume;

      volWrap.appendChild(vol);
      volWrap.appendChild(valSpan);
      row.appendChild(volWrap);

      const fxCell = document.createElement('div');
      fxCell.style.display = 'flex';
      fxCell.style.flexDirection = 'column';
      fxCell.style.alignItems = 'stretch';
      const fxBtn = document.createElement('button');
      fxBtn.textContent = 'FX(0)';
      fxBtn.title = 'Show FX chain';
      fxBtn.style.fontSize = '10px';
      fxBtn.style.padding = '2px 4px';
      fxBtn.style.cursor = 'pointer';
      fxBtn.style.background = '#dde3ea';
      fxBtn.style.border = '1px solid #bcc7d1';
      fxBtn.style.borderRadius = '3px';
      fxBtn.style.position = 'relative';
      fxBtn.style.minWidth = '38px';
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
          panel.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.05)';
          row.appendChild(panel);
          renderFxPanel();
        } else {
          if (panel.style.display === 'none') { panel.style.display = 'block'; renderFxPanel(); }
          else { panel.style.display = 'none'; }
        }
      });
      updateBtnCount();

      trackListDiv.appendChild(row);
    });

    const masterRow = document.createElement('div');
    masterRow.style.display = 'grid';
    masterRow.style.gridTemplateColumns = '55px 48px 20px 20px 0.2fr 0px';
    masterRow.style.alignItems = 'center';
    masterRow.style.columnGap = '3px';
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
    mVol.value = String((window as any).masterGainValue ?? 1);
    mVol.style.flex = '1'; mVol.style.cursor = 'pointer';
    const mVal = document.createElement('span');
    mVal.style.fontSize = '10px'; mVal.style.minWidth = '34px'; mVal.style.textAlign = 'center';
    const setMaster = (v: number) => {
      v = Math.min(2, Math.max(0, v));
      (window as any).masterGainValue = v;
      mVol.value = String(v);
      mVal.textContent = (v * 100).toFixed(0);
      const toggleAudioCheckbox = document.getElementById('toggle-audio') as HTMLInputElement | null;
      if ((window as any).outputGainNode && toggleAudioCheckbox && toggleAudioCheckbox.checked) {
        (window as any).outputGainNode.gain.value = v;
      }
    };
    mVal.textContent = (parseFloat(mVol.value) * 100).toFixed(0);
    mVol.addEventListener('input', () => setMaster(parseFloat(mVol.value)));
    mVol.addEventListener('wheel', (e) => { e.preventDefault(); const d = e.deltaY < 0 ? 0.02 : -0.02; setMaster(parseFloat(mVol.value) + d); }, { passive: false });
    mVolWrap.appendChild(mVol); mVolWrap.appendChild(mVal);
    masterRow.appendChild(mVolWrap);

    const mFxCell = document.createElement('div');
    const mFxBtn = document.createElement('button');
    mFxBtn.style.fontSize = '10px'; mFxBtn.style.padding = '2px 4px';
    mFxBtn.style.cursor = 'pointer';
    const updateMasterFxCount = () => {
      const count = (window as any).busManager?.getEffectsChainMeta?.().length || 0;
      mFxBtn.textContent = 'FX(' + count + ')';
    };
    updateMasterFxCount();
    mFxCell.appendChild(mFxBtn);
    masterRow.appendChild(mFxCell);
    trackListDiv.appendChild(masterRow);

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
      masterSection.style.display = 'none';
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

      function refreshCategoryButtons() {
        const existingCategoryBtns = ctrl.querySelectorAll('[data-category-btn]');
        existingCategoryBtns.forEach(btn => btn.remove());

        const availableEffects = listRegisteredEffects();
        const categories = [...new Set(availableEffects.map(fx => fx.category))];

        console.log(`[Effects] Refreshing category buttons. Available effects: ${availableEffects.length}, Categories: ${categories.join(', ')}`);

        categories.forEach(category => {
          const categoryEffects = availableEffects.filter(fx => fx.category === category);
          if (categoryEffects.length > 0) {
            const categoryBtn = mk(`+${category}`, async () => {
              const firstEffect = categoryEffects[0];
              console.log(`[Effects] Adding ${firstEffect.refId} (${category})`);

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
            categoryBtn.setAttribute('data-category-btn', 'true');

            const clearBtn = ctrl.querySelector('button:last-child');
            if (clearBtn) {
              ctrl.insertBefore(categoryBtn, clearBtn);
            } else {
              ctrl.appendChild(categoryBtn);
            }
          }
        });
      }

      refreshCategoryButtons();

      document.addEventListener('effect-registry-updated', () => {
        console.log('[Effects] Registry updated, refreshing category buttons');
        refreshCategoryButtons();
      });

      ctrl.appendChild(mk('Clear', () => { enqueueMasterFx({ action: 'clear' }); }));

      masterSection.appendChild(ctrl);
      trackListDiv.appendChild(masterSection);

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

          const displayName = it.refId ? `${it.index + 1}. ${it.refId}` : `${it.index + 1}. ${it.type}`;
          const name = document.createElement('span');
          name.textContent = displayName;
          name.style.fontWeight = '600';
          name.style.fontSize = '10px';

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

      mFxBtn.addEventListener('click', () => {
        if (!masterSection) return;
        const visible = masterSection.style.display !== 'none';
        masterSection.style.display = visible ? 'none' : 'block';
        if (!visible) renderMasterFxChain();
      });
    } else {
      mFxBtn.addEventListener('click', () => {
        const visible = masterSection!.style.display !== 'none';
        masterSection!.style.display = visible ? 'none' : 'block';
      });
      updateMasterFxCount();
    }
  }
  document.addEventListener('tracks-changed', renderTrackList);
  document.addEventListener('track-volume-changed', (e: any) => {
    const { id, vol } = e.detail || {};
    const slider = trackListDiv.querySelector(`input[type="range"][data-track-id="${id}"]`) as HTMLInputElement | null;
    const valSpan = slider?.parentElement?.querySelector('span') as HTMLSpanElement | null;
    if (slider) slider.value = String(vol);
    if (valSpan) valSpan.textContent = (vol * 100).toFixed(0);
  });
  renderTrackList();

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'source': '#22c55e',
      'effect': '#3b82f6',
      'hybrid': '#8b5cf6',
      'utility': '#6b7280'
    };
    return colors[category] || '#6b7280';
  }

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
            const db = 20 * Math.log10(Math.max(l.level, 1e-5));
            lvlText.textContent = db.toFixed(1);
          }
        }
      });

      const masterFill = trackListDiv.querySelector('.master-meter-fill') as HTMLDivElement | null;
      const masterLevel = trackListDiv.querySelector('.master-level-display') as HTMLSpanElement | null;
      if (masterFill && masterLevel && (window as any).outputGainNode) {
        const outputGain = (window as any).outputGainNode as GainNode;

        if (!(window as any).masterAnalyser) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          (window as any).masterAnalyser = analyser;
          (window as any).masterAnalyserData = new Uint8Array(analyser.frequencyBinCount);

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
            masterFill.style.width = '0%';
            masterLevel.textContent = 'ERR';
          }
        }
      }
    }
    requestAnimationFrame(updateMeters);
  }
  requestAnimationFrame(updateMeters);

  let nameEditGuard = false;
  function beginEditTrackName(trackId: string, labelEl: HTMLSpanElement) {
    if (labelEl.dataset.editing === 'true') return;
    labelEl.dataset.editing = 'true';
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

  (window as any).trackAPI = (window as any).trackAPI || {};
  (window as any).trackAPI.setName = (id: string, name: string) => {
    if ((window as any).setTrackName) {
      (window as any).setTrackName(id, name);
    } else {
      document.dispatchEvent(new CustomEvent('track-name-changed', { detail: { id, name } }));
    }
  };
  (window as any).logicInputManagerInstance = logicInputManager;

  document.addEventListener('track-name-changed', (e: any) => {
    if (nameEditGuard) return;
    const { id, name } = e.detail || {};
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
    const li = logicInputManager.list().find(l => l.id === id);
    if (li && li.trackId) {
      (window as any).trackAPI?.setName?.(li.trackId, label);
    }
  });

  logicInputManager.setTrackDisposer((trackId: string) => {
    if ((window as any).disposeTrack) {
      (window as any).disposeTrack(trackId);
    } else {
    }
  });

  (window as any).logicInputAPI = (window as any).logicInputAPI || {};
  (window as any).logicInputAPI.remove = (id: string) => logicInputManager.remove(id);

  (window as any).fxAPI = (window as any).fxAPI || {};
  (window as any).fxAPI.list = () => listRegisteredEffects();
  (window as any).fxAPI.addEffect = async (refId: string) => {
    const busManager = (window as any).busManager;
    if (busManager && busManager.addEffectFromRegistry) {
      try {
        const item = await busManager.addEffectFromRegistry(refId);
        console.log(`[fxAPI] Added effect: ${refId}`, item);

        const outputGain = (window as any).outputGainNode;
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

  (window as any).fxAPI.diagnose = () => {
    const busManager = (window as any).busManager;
    if (!busManager) {
      console.log('[fxAPI.diagnose] busManager not available');
      return;
    }

    console.log('\n=== Audio Chain Diagnostic ===');

    const chain = busManager.getEffectsChainMeta ? busManager.getEffectsChainMeta() : [];
    console.log('Effects Chain:', chain);

    const refIds = chain.map((item: any) => item.refId).filter(Boolean);
    const duplicates = refIds.filter((id: string, index: number) => refIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      console.warn('⚠️ Duplicate effect instances found:', duplicates);
    }

    const outputGain = (window as any).outputGainNode;
    if (outputGain) {
      console.log('Output Gain Node:', outputGain.gain.value);
    }

    if (audioCtx) {
      console.log('AudioContext state:', audioCtx.state);
      console.log('AudioContext sample rate:', audioCtx.sampleRate);
    }

    console.log('=== End Diagnostic ===\n');
  };

  (window as any).fxAPI.cleanup = () => {
    const busManager = (window as any).busManager;
    if (busManager && busManager.clearEffectsChain) {
      busManager.clearEffectsChain();
      console.log('[fxAPI] Effects chain cleared');
    }
  };

  (window as any).trackDiagnose = async (id?: string) => {
    const { diagnoseTrackVolume } = await import('../audio/tracks');
    diagnoseTrackVolume(id);
  };
  (window as any).trackReset = async (id: string) => {
    const { resetTrackVolume } = await import('../audio/tracks');
    return resetTrackVolume(id);
  };
  (window as any).trackRebuild = async (id: string) => {
    const { rebuildTrackChain } = await import('../audio/tracks');
    return rebuildTrackChain(id);
  };
  (window as any).fxAPI.preloadAll = async () => {
    if (!(window as any).audioCtx) {
      console.warn('[fxAPI] audioCtx 未初期化。initAudio 実行後に再試行');
      return;
    }
    await preloadAllEffects((window as any).audioCtx);
    console.log('[fxAPI] preloadAll 完了');
  };
  (window as any).fxAPI.createInstance = async (refId: string) => {
    if (!(window as any).audioCtx) throw new Error('audioCtx 未初期化');
    const inst = await createEffectInstance(refId, (window as any).audioCtx);
    console.log('[fxAPI] created', inst);
    return { id: inst.id, refId: inst.refId, kind: inst.kind, bypass: inst.bypass, params: inst.controller?.listParams?.() };
  };
  console.log('[fxAPI] Registered Effects:', (window as any).fxAPI.list());

  (window as any).trackFxAPI = (window as any).trackFxAPI || {};
  (window as any).trackFxAPI.add = (trackId: string, refId: string) => addTrackEffect(trackId, refId);
  (window as any).trackFxAPI.remove = (effectId: string) => removeTrackEffect(effectId);
  (window as any).trackFxAPI.toggleBypass = (effectId: string) => toggleTrackEffectBypass(effectId);
  (window as any).trackFxAPI.move = (trackId: string, effectId: string, newIndex: number) => moveTrackEffect(trackId, effectId, newIndex);
  (window as any).trackFxAPI.list = (trackId: string) => listTrackEffectsMeta(trackId);
  document.addEventListener('track-effects-changed', (e: any) => { console.log('[track-effects-changed]', e.detail); });

  return { logicInputManager };
}
