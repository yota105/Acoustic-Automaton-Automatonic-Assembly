// 論理Inputと物理デバイスのアサイン管理（セレクタUI含む）
import { LogicInputManager } from '../core/logicInputs';

export class DeviceAssignmentUI {
    constructor(
        private logicInputManager: LogicInputManager,
        private getPhysicalDevices: () => { id: string; label: string; enabled: boolean }[],
        private container: HTMLElement
    ) { }

    render() {
        const logicInputs = this.logicInputManager.list();
        const devices = this.getPhysicalDevices();
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
            row.querySelector('select')?.addEventListener('change', (e) => {
                const deviceId = (e.target as HTMLSelectElement).value || null;
                console.log(`[DeviceAssignment] Device selection changed for ${input.id}:`);
                console.log(`  - Selected device ID: ${deviceId}`);
                console.log(`  - Selected device label: ${devices.find(d => d.id === deviceId)?.label || 'None'}`);
                console.log(`  - Available devices:`, devices.map(d => ({ id: d.id, label: d.label, enabled: d.enabled })));
                
                this.logicInputManager.assignDevice(input.id, deviceId);
                document.dispatchEvent(new CustomEvent('logic-input-assignment-changed', { detail: { id: input.id } }));
            });
            this.container.appendChild(row);
        });
    }
}
