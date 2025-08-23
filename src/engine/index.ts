/**
 * Engine Main Export
 * Entry point for the Universal Audio-Visual Engine
 */

// Framework exports
export * from './framework/index.js';

// Engine status and initialization
export interface EngineStatus {
  framework: boolean;
  audio: boolean;
  visual: boolean;
  timing: boolean;
}

let engineStatus: EngineStatus = {
  framework: false,
  audio: false,
  visual: false,
  timing: false
};

export function getEngineStatus(): EngineStatus {
  return { ...engineStatus };
}

export async function initializeEngine(): Promise<void> {
  console.log('🏗️ Initializing Universal Audio-Visual Engine...');

  try {
    // Initialize framework first
    const { eventBus, workManager } = await import('./framework/index.js').then(m => m.initializeFramework());
    engineStatus.framework = true;

    console.log('✅ Engine initialized successfully');

    // Expose to window for debugging
    if (typeof window !== 'undefined') {
      (window as any).engine = {
        eventBus,
        workManager,
        getStatus: getEngineStatus
      };
    }

  } catch (error) {
    console.error('❌ Failed to initialize engine:', error);
    throw error;
  }
}
