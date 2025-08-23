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
        <span>${input.label}</span>
        <select id="assign-device-${input.id}">
          <option value="">(Unassigned)</option>
          ${devices.map(d => `<option value="${d.id}" ${input.assignedDeviceId === d.id ? 'selected' : ''}>${d.label}${d.enabled ? '' : ' (Disabled)'}</option>`).join('')}
        </select>
      `;
            row.querySelector('select')?.addEventListener('change', async (e) => {
                const deviceId = (e.target as HTMLSelectElement).value || null;
                console.log(`[DeviceAssignment] Device selection changed for ${input.id}:`);
                console.log(`  - Selected device ID: ${deviceId}`);
                console.log(`  - Selected device label: ${devices.find(d => d.id === deviceId)?.label || 'None'}`);
                console.log(`  - Available devices:`, devices.map(d => ({ id: d.id, label: d.label, enabled: d.enabled })));
                
                // Logic Input Managerでの割り当て更新
                this.logicInputManager.assignDevice(input.id, deviceId);
                
                // 実際のデバイス接続を更新
                const inputManager = (window as any).inputManager;
                if (inputManager && inputManager.updateDeviceConnection) {
                    try {
                        await inputManager.updateDeviceConnection(input.id, deviceId);
                        console.log(`[DeviceAssignment] Successfully updated device connection for ${input.id}`);
                    } catch (error) {
                        console.error(`[DeviceAssignment] Failed to update device connection for ${input.id}:`, error);
                    }
                }
                
                document.dispatchEvent(new CustomEvent('logic-input-assignment-changed', { detail: { id: input.id } }));
            });
            this.container.appendChild(row);
        });
    }
}
