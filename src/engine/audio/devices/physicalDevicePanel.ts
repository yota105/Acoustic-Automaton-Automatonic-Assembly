// Physical Device List and Status Display UI
export class PhysicalDevicePanel {
    constructor(
        private getPhysicalDevices: () => Promise<{ id: string; label: string; enabled: boolean }[]>,
        private container: HTMLElement
    ) { }

    async render() {
        const devices = await this.getPhysicalDevices();
        this.container.innerHTML = '<b>Input/Output Device List</b><br>';
        devices.forEach(d => {
            this.container.innerHTML += `${d.label} [${d.enabled ? 'Enabled' : 'Disabled'}]<br>`;
        });
    }
}
