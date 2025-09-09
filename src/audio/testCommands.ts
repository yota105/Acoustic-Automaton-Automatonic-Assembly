/**
 * Test Commands System for Phase 5
 * Console-based testing interface to keep UI clean
 */

export interface TestCommand {
    name: string;
    description: string;
    execute: () => Promise<void> | void;
}

export class TestCommandsManager {
    private static instance: TestCommandsManager;
    private commands: Map<string, TestCommand> = new Map();

    private constructor() {
        this.initializeCommands();
        this.setupGlobalAccess();
    }

    static getInstance(): TestCommandsManager {
        if (!TestCommandsManager.instance) {
            TestCommandsManager.instance = new TestCommandsManager();
        }
        return TestCommandsManager.instance;
    }

    private initializeCommands(): void {
        // Musical Time Tests
        this.registerCommand('musical-time', {
            name: 'Musical Time Tests',
            description: '🎼 Musical Time Manager initialization and testing',
            execute: async () => {
                console.log('🎼 Executing Musical Time Tests...');
                const event = new CustomEvent('test-command', { detail: 'musical-time-tests' });
                document.dispatchEvent(event);
            }
        });

        // Base Audio
        this.registerCommand('base-audio', {
            name: 'Base Audio System',
            description: '🎵 Initialize base audio system',
            execute: async () => {
                console.log('🎵 Executing Base Audio initialization...');
                const event = new CustomEvent('test-command', { detail: 'base-audio' });
                document.dispatchEvent(event);
            }
        });

        // Phase 4 AudioWorklet Test
        this.registerCommand('phase4-audioworklet', {
            name: 'Phase 4 AudioWorklet Test',
            description: '⚡ Test AudioWorklet performance system',
            execute: async () => {
                console.log('⚡ Executing Phase 4 AudioWorklet Test...');
                const event = new CustomEvent('test-command', { detail: 'phase4-audioworklet' });
                document.dispatchEvent(event);
            }
        });

        // Performance Monitor
        this.registerCommand('performance-monitor', {
            name: 'Performance Monitor',
            description: '📊 Display performance monitoring',
            execute: async () => {
                console.log('📊 Executing Performance Monitor...');
                const event = new CustomEvent('test-command', { detail: 'performance-monitor' });
                document.dispatchEvent(event);
            }
        });

        // Memory Optimization
        this.registerCommand('memory-optimize', {
            name: 'Memory Optimization',
            description: '🧠 Phase 4b memory optimization test',
            execute: async () => {
                console.log('🧠 Executing Memory Optimization...');
                const event = new CustomEvent('test-command', { detail: 'memory-optimize' });
                document.dispatchEvent(event);
            }
        });

        // Buffer Stress Test
        this.registerCommand('stress-test', {
            name: 'Buffer Stress Test',
            description: '🔥 Buffer pooling stress test',
            execute: async () => {
                console.log('🔥 Executing Buffer Stress Test...');
                const event = new CustomEvent('test-command', { detail: 'stress-test' });
                document.dispatchEvent(event);
            }
        });

        // AudioWorklet Comparison
        this.registerCommand('worklet-comparison', {
            name: 'AudioWorklet vs Main Thread',
            description: '⚔️ Compare AudioWorklet and main thread performance',
            execute: async () => {
                console.log('⚔️ Executing AudioWorklet Comparison...');
                const event = new CustomEvent('test-command', { detail: 'worklet-comparison' });
                document.dispatchEvent(event);
            }
        });

        // Timing Tests
        this.registerCommand('timing-test', {
            name: 'Timing Test',
            description: '⏱️ Musical timing accuracy test',
            execute: async () => {
                console.log('⏱️ Executing Timing Test...');
                const event = new CustomEvent('test-command', { detail: 'timing-test' });
                document.dispatchEvent(event);
            }
        });

        // Simple Beat Test
        this.registerCommand('beat-test', {
            name: 'Simple Beat Test',
            description: '🥁 Simple beat generation test',
            execute: async () => {
                console.log('🥁 Executing Simple Beat Test...');
                const event = new CustomEvent('test-command', { detail: 'beat-test' });
                document.dispatchEvent(event);
            }
        });

        // MTM Performance Test
        this.registerCommand('mtm-performance', {
            name: 'MTM Performance Test',
            description: '🚀 Musical Time Manager performance test',
            execute: async () => {
                console.log('🚀 Executing MTM Performance Test...');
                const event = new CustomEvent('test-command', { detail: 'mtm-performance' });
                document.dispatchEvent(event);
            }
        });

        // MTM Tempo Test
        this.registerCommand('mtm-tempo', {
            name: 'MTM Tempo Test',
            description: '🎵 Musical Time Manager tempo test',
            execute: async () => {
                console.log('🎵 Executing MTM Tempo Test...');
                const event = new CustomEvent('test-command', { detail: 'mtm-tempo' });
                document.dispatchEvent(event);
            }
        });

        // MTM Complex Test
        this.registerCommand('mtm-complex', {
            name: 'MTM Complex Test',
            description: '🎼 Musical Time Manager complex timing test',
            execute: async () => {
                console.log('🎼 Executing MTM Complex Test...');
                const event = new CustomEvent('test-command', { detail: 'mtm-complex' });
                document.dispatchEvent(event);
            }
        });

        // MTM Metronome Test
        this.registerCommand('mtm-metronome', {
            name: 'MTM Metronome Test',
            description: '🎯 Musical Time Manager metronome test',
            execute: async () => {
                console.log('🎯 Executing MTM Metronome Test...');
                const event = new CustomEvent('test-command', { detail: 'mtm-metronome' });
                document.dispatchEvent(event);
            }
        });

        // === PHASE 5 LIVE PERFORMANCE SYSTEM TESTS ===

        // Phase 5 TrackManager Test
        this.registerCommand('phase5-trackmanager', {
            name: 'Phase 5 TrackManager Test',
            description: '🎵 Test TrackManager basic functionality',
            execute: async () => {
                console.log('🎵 Executing Phase 5 TrackManager Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-trackmanager' });
                document.dispatchEvent(event);
            }
        });

        // Phase 5 LiveMixer Test
        this.registerCommand('phase5-livemixer', {
            name: 'Phase 5 LiveMixer Test',
            description: '🎛️ Test LiveMixer channel management',
            execute: async () => {
                console.log('🎛️ Executing Phase 5 LiveMixer Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-livemixer' });
                document.dispatchEvent(event);
            }
        });

        // Phase 5 Integration Test
        this.registerCommand('phase5-integration', {
            name: 'Phase 5 Integration Test',
            description: '🔗 Test TrackManager + LiveMixer integration',
            execute: async () => {
                console.log('🔗 Executing Phase 5 Integration Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-integration' });
                document.dispatchEvent(event);
            }
        });

        // Phase 5 UR22C Setup Test
        this.registerCommand('phase5-ur22c', {
            name: 'Phase 5 UR22C Setup Test',
            description: '🎤 Test UR22C input detection and setup',
            execute: async () => {
                console.log('🎤 Executing Phase 5 UR22C Setup Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-ur22c' });
                document.dispatchEvent(event);
            }
        });

        // Phase 5 Internal Synth Test
        this.registerCommand('phase5-synth', {
            name: 'Phase 5 Internal Synth Test',
            description: '🎹 Test internal synthesizer setup',
            execute: async () => {
                console.log('🎹 Executing Phase 5 Internal Synth Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-synth' });
                document.dispatchEvent(event);
            }
        });

        // Phase 5 Click Track Test
        this.registerCommand('phase5-click', {
            name: 'Phase 5 Click Track Test',
            description: '🥁 Test click track setup and monitoring',
            execute: async () => {
                console.log('🥁 Executing Phase 5 Click Track Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-click' });
                document.dispatchEvent(event);
            }
        });

        // Phase 5 Full System Test
        this.registerCommand('phase5-full', {
            name: 'Phase 5 Full System Test',
            description: '🎪 Complete Phase 5 live performance system test',
            execute: async () => {
                console.log('🎪 Executing Phase 5 Full System Test...');
                const event = new CustomEvent('test-command', { detail: 'phase5-full' });
                document.dispatchEvent(event);
            }
        });
    }

    private setupGlobalAccess(): void {
        // Global test function
        (window as any).test = (commandName: string) => {
            this.executeCommand(commandName);
        };

        // Global help function
        (window as any).testHelp = () => {
            this.showHelp();
        };

        // Global list function
        (window as any).testList = () => {
            this.listCommands();
        };

        console.log('🧪 Test Commands System initialized!');
        console.log('Usage:');
        console.log('  test("command-name")  - Execute a test command');
        console.log('  testList()           - List all available commands');
        console.log('  testHelp()           - Show detailed help');
    }

    registerCommand(name: string, command: TestCommand): void {
        this.commands.set(name, command);
    }

    executeCommand(name: string): void {
        const command = this.commands.get(name);
        if (command) {
            console.log(`🔧 Executing: ${command.name}`);
            command.execute();
        } else {
            console.error(`❌ Unknown test command: ${name}`);
            console.log('Available commands:');
            this.listCommands();
        }
    }

    listCommands(): void {
        console.log('📋 Available Test Commands:');
        console.log('='.repeat(50));
        for (const [name, command] of this.commands) {
            console.log(`  test("${name}")  - ${command.description}`);
        }
        console.log('='.repeat(50));
    }

    showHelp(): void {
        console.log('🧪 Test Commands System Help');
        console.log('='.repeat(50));
        console.log('This system provides console-based access to all test functions.');
        console.log('');
        console.log('Basic Usage:');
        console.log('  test("musical-time")     - Run Musical Time Tests');
        console.log('  test("base-audio")       - Initialize Base Audio');
        console.log('  test("phase4-audioworklet") - Test AudioWorklet');
        console.log('');
        console.log('Quick Start Sequence:');
        console.log('  1. test("base-audio")');
        console.log('  2. test("musical-time")');
        console.log('  3. test("phase4-audioworklet")');
        console.log('');
        console.log('Performance Tests:');
        console.log('  test("performance-monitor")');
        console.log('  test("memory-optimize")');
        console.log('  test("stress-test")');
        console.log('');
        console.log('Use testList() to see all available commands.');
        console.log('='.repeat(50));
    }
}

// Initialize the test commands system
export const testCommands = TestCommandsManager.getInstance();
