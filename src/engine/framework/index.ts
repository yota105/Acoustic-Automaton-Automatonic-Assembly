/**
 * Engine Framework Exports
 * Main entry point for the work-centered framework
 */

// Core interfaces and types
export * from './musicalWork.js';
export * from './workManager.js';
export * from './eventBus.js';

// Re-export main classes for convenience
export { WorkManager, initializeWorkManager, getWorkManager } from './workManager.js';
export { EventBus, initializeEventBus, getEventBus, EventHelpers } from './eventBus.js';
export { BaseSection } from './musicalWork.js';

// Import the initialization functions
import { initializeEventBus } from './eventBus.js';
import { initializeWorkManager } from './workManager.js';
import type { MusicalWork } from './musicalWork.js';

// Framework initialization function
export async function initializeFramework() {
  console.log('🚀 Initializing Work Framework...');
  
  try {
    // Initialize EventBus first
    const eventBus = initializeEventBus();
    
    // Initialize WorkManager
    const workManager = initializeWorkManager();
    
    // Set up cross-component communication
    workManager.onError = (error: Error, context: string) => {
      eventBus.emit('system:error', { error, context }, 'WorkManager');
    };
    
    workManager.onWorkChanged = (workName: string | null, work: MusicalWork | null) => {
      if (workName && work) {
        eventBus.emit('work:started', { workName }, 'WorkManager');
      } else {
        eventBus.emit('work:stopped', { workName: workName || 'unknown' }, 'WorkManager');
      }
    };
    
    // Emit system ready event
    eventBus.emit('system:ready', {}, 'Framework');
    
    console.log('✅ Work Framework initialized successfully');
    
    return {
      eventBus,
      workManager
    };
  } catch (error) {
    console.error('❌ Failed to initialize framework:', error);
    throw error;
  }
}
