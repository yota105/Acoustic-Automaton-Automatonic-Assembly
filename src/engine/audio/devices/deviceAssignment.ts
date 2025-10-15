// 論理Inputと物理デバイスのアサイン管理（セレクタUI含む）
import { LogicInputManager } from '../core/logicInputs';

export class DeviceAssignmentUI {
    constructor(
        private logicInputManager: LogicInputManager,
        private getPhysicalDevices: () => Promise<{ id: string; label: string; enabled: boolean }[]>,
        private container: HTMLElement
    ) { }

    async render() {
        const logicInputs = this.logicInputManager.list();
        const devices = await this.getPhysicalDevices();
        this.container.innerHTML = '';
        logicInputs.forEach(input => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            row.innerHTML = `
        <span style="min-width: 80px;">${input.label}</span>
        <select id="assign-device-${input.id}" style="min-width: 200px;">
          <option value="">(Unassigned)</option>
          ${devices.map(d => `<option value="${d.id}" ${input.assignedDeviceId === d.id ? 'selected' : ''}>${d.label}${d.enabled ? '' : ' (Disabled)'}</option>`).join('')}
        </select>
        <select id="assign-channel-${input.id}" style="min-width: 80px;">
          <option value="">Mono/All</option>
          ${Array.from({ length: 32 }, (_, i) => `<option value="${i}" ${input.channelIndex === i ? 'selected' : ''}>CH${i + 1}</option>`).join('')}
        </select>
      `;

            const deviceSelect = row.querySelector(`#assign-device-${input.id}`) as HTMLSelectElement;
            const channelSelect = row.querySelector(`#assign-channel-${input.id}`) as HTMLSelectElement;

            // デバイス選択のイベントリスナー
            deviceSelect?.addEventListener('change', async (e) => {
                const deviceId = (e.target as HTMLSelectElement).value || null;
                const channelIndex = channelSelect.value ? parseInt(channelSelect.value) : undefined;

                console.log(`[DeviceAssignment] Device selection changed for ${input.id}:`);
                console.log(`  - Selected device ID: ${deviceId}`);
                console.log(`  - Selected channel: ${channelIndex !== undefined ? `CH${channelIndex + 1}` : 'Mono/All'}`);
                console.log(`  - Selected device label: ${devices.find(d => d.id === deviceId)?.label || 'None'}`);

                // Logic Input Managerでの割り当て更新
                this.logicInputManager.assignDevice(input.id, deviceId);
                if (channelIndex !== undefined) {
                    this.logicInputManager.assignChannel(input.id, channelIndex);
                }

                // 実際のデバイス接続を更新（有効な場合のみ）
                if (input.enabled) {
                    const inputManager = (window as any).inputManager;
                    if (inputManager && inputManager.updateDeviceConnectionWithChannel) {
                        try {
                            await inputManager.updateDeviceConnectionWithChannel(input.id, deviceId, channelIndex);
                            console.log(`[DeviceAssignment] Successfully updated device connection for ${input.id} with channel ${channelIndex}`);
                        } catch (error) {
                            console.error(`[DeviceAssignment] Failed to update device connection for ${input.id}:`, error);
                        }
                    }
                } else {
                    console.log(`[DeviceAssignment] Skipped connection for ${input.id} (disabled)`);
                }

                document.dispatchEvent(new CustomEvent('logic-input-assignment-changed', { detail: { id: input.id } }));
            });

            // チャンネル選択のイベントリスナー
            channelSelect?.addEventListener('change', async (e) => {
                const deviceId = deviceSelect.value || null;
                const channelIndex = (e.target as HTMLSelectElement).value ? parseInt((e.target as HTMLSelectElement).value) : undefined;

                if (deviceId) {
                    console.log(`[DeviceAssignment] Channel selection changed for ${input.id}:`);
                    console.log(`  - Device ID: ${deviceId}`);
                    console.log(`  - New channel: ${channelIndex !== undefined ? `CH${channelIndex + 1}` : 'Mono/All'}`);

                    // Logic Input Managerでチャンネル割り当て更新
                    this.logicInputManager.assignChannel(input.id, channelIndex);

                    // 実際のデバイス接続を更新（有効な場合のみ）
                    if (input.enabled) {
                        const inputManager = (window as any).inputManager;
                        if (inputManager && inputManager.updateDeviceConnectionWithChannel) {
                            try {
                                await inputManager.updateDeviceConnectionWithChannel(input.id, deviceId, channelIndex);
                                console.log(`[DeviceAssignment] Successfully updated channel for ${input.id} to ${channelIndex}`);
                            } catch (error) {
                                console.error(`[DeviceAssignment] Failed to update channel for ${input.id}:`, error);
                            }
                        }
                    } else {
                        console.log(`[DeviceAssignment] Skipped channel update for ${input.id} (disabled)`);
                    }

                    document.dispatchEvent(new CustomEvent('logic-input-assignment-changed', { detail: { id: input.id } }));
                }
            });

            this.container.appendChild(row);
        });
    }
}
