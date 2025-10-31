// 論理Inputと物理デバイスのアサイン管理（セレクタUI含む）
import { LogicInputManager } from '../core/logicInputs';

export class DeviceAssignmentUI {
    constructor(
        private logicInputManager: LogicInputManager,
        private getPhysicalDevices: () => Promise<{ id: string; label: string; enabled: boolean }[]>,
        private container: HTMLElement
    ) {
        document.addEventListener('mic-input-channel-info', this.handleMicChannelInfo);
        document.addEventListener('logic-input-channel-fallback', this.handleLogicInputFallback);
    }
    private channelSelectMap = new Map<string, HTMLSelectElement>();
    private deviceSelectMap = new Map<string, HTMLSelectElement>();

    private readonly handleMicChannelInfo = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (!detail) return;
        const { deviceId, availableChannels } = detail;
        if (!deviceId) return;

        this.channelSelectMap.forEach((select, logicInputId) => {
            const deviceSelect = this.deviceSelectMap.get(logicInputId);
            if (deviceSelect && deviceSelect.value === deviceId) {
                this.applyChannelAvailability(select, availableChannels);
            }
        });
    };

    private readonly handleLogicInputFallback = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (!detail) return;
        const {
            logicInputId,
            actualChannelIndex,
            requestedChannelIndex,
            availableChannels,
            deviceId
        } = detail;

        const select = this.channelSelectMap.get(logicInputId);
        if (!select) return;

        this.applyChannelAvailability(select, availableChannels);

        if (actualChannelIndex !== undefined && actualChannelIndex !== null) {
            select.value = String(actualChannelIndex);
        } else {
            select.value = '';
        }

        const fallbackApplied = requestedChannelIndex !== undefined && requestedChannelIndex !== actualChannelIndex;
        this.setFallbackState(select, fallbackApplied, actualChannelIndex, requestedChannelIndex, availableChannels, deviceId);
    };

    async render() {
        const logicInputs = this.logicInputManager.list();
        const devices = await this.getPhysicalDevices();
        this.container.innerHTML = '';
        this.channelSelectMap.clear();
        this.deviceSelectMap.clear();
        logicInputs.forEach(input => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';

            // ラベル(メーターなし - RoutingUIのみで表示)
            const labelSpan = document.createElement('span');
            labelSpan.textContent = input.label;
            labelSpan.style.fontSize = '12px';
            labelSpan.style.minWidth = '80px';
            row.appendChild(labelSpan);

            // デバイスセレクタ
            const deviceSelect = document.createElement('select');
            deviceSelect.id = `assign-device-${input.id}`;
            deviceSelect.style.minWidth = '200px';

            const unassignedOption = document.createElement('option');
            unassignedOption.value = '';
            unassignedOption.textContent = '(Unassigned)';
            deviceSelect.appendChild(unassignedOption);

            devices.forEach(d => {
                const option = document.createElement('option');
                option.value = d.id;
                option.textContent = `${d.label}${d.enabled ? '' : ' (Disabled)'}`;
                if (input.assignedDeviceId === d.id) option.selected = true;
                deviceSelect.appendChild(option);
            });
            row.appendChild(deviceSelect);

            // チャンネルセレクタ
            const channelSelect = document.createElement('select');
            channelSelect.id = `assign-channel-${input.id}`;
            channelSelect.style.minWidth = '80px';

            const monoOption = document.createElement('option');
            monoOption.value = '';
            monoOption.textContent = 'Mono/All';
            channelSelect.appendChild(monoOption);

            for (let i = 0; i < 32; i++) {
                const option = document.createElement('option');
                option.value = String(i);
                option.textContent = `CH${i + 1}`;
                if (input.channelIndex === i) option.selected = true;
                channelSelect.appendChild(option);
            }
            row.appendChild(channelSelect);

            this.deviceSelectMap.set(input.id, deviceSelect);
            this.channelSelectMap.set(input.id, channelSelect);
            this.applyChannelAvailability(channelSelect);
            this.setFallbackState(channelSelect, false);

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

    private applyChannelAvailability(select: HTMLSelectElement, availableChannels?: number) {
        const options = Array.from(select.options).filter(opt => opt.value !== '');
        if (!availableChannels || availableChannels <= 0) {
            options.forEach(opt => { opt.disabled = false; });
            return;
        }
        options.forEach(opt => {
            const idx = parseInt(opt.value, 10);
            if (Number.isFinite(idx)) {
                opt.disabled = idx >= availableChannels;
            }
        });
    }

    private setFallbackState(
        select: HTMLSelectElement,
        fallbackApplied: boolean,
        actualChannelIndex?: number,
        requestedChannelIndex?: number,
        availableChannels?: number,
        deviceId?: string
    ) {
        if (fallbackApplied) {
            select.dataset.fallback = 'true';
            select.style.outline = '2px solid #ff9800';
            const actualLabel = actualChannelIndex !== undefined ? `CH${actualChannelIndex + 1}` : 'Mono/All';
            const requestedLabel = requestedChannelIndex !== undefined ? `CH${requestedChannelIndex + 1}` : 'Mono/All';
            select.title = `Requested ${requestedLabel}, but device${deviceId ? ` ${deviceId}` : ''} exposes ${availableChannels ?? '?'} channel(s). Using ${actualLabel}.`;
        } else {
            select.dataset.fallback = 'false';
            select.style.outline = '';
            select.title = '';
        }
    }
}
