/**
 * Work Manager
 * Manages lifecycle and switching of musical works
 */

import { MusicalWork, WorkMetadata, WorkState, WorkConfig } from './musicalWork.js';

export interface WorkRegistration {
  work: MusicalWork;
  config: WorkConfig;
  loadedAt: Date;
  lastUsed: Date;
}

export class WorkManager {
  private availableWorks = new Map<string, WorkRegistration>();
  private currentWork: MusicalWork | null = null;
  private currentWorkName: string | null = null;
  private isTransitioning = false;
  
  // Event callbacks
  public onWorkChanged?: (workName: string | null, work: MusicalWork | null) => void;
  public onWorkStateChanged?: (workName: string, oldState: WorkState, newState: WorkState) => void;
  public onError?: (error: Error, context: string) => void;
  
  constructor() {
    console.log('🎭 WorkManager initialized');
  }
  
  // Work registration and management
  async registerWork(workName: string, work: MusicalWork, config: WorkConfig = {}): Promise<void> {
    try {
      console.log(`📝 Registering work: ${workName}`);
      
      // Set up state change monitoring
      const originalOnStateChange = work.onStateChange;
      work.onStateChange = (oldState, newState) => {
        this.onWorkStateChanged?.(workName, oldState, newState);
        originalOnStateChange?.(oldState, newState);
      };
      
      // Load the work
      await work.load();
      
      const registration: WorkRegistration = {
        work,
        config,
        loadedAt: new Date(),
        lastUsed: new Date()
      };
      
      this.availableWorks.set(workName, registration);
      console.log(`✅ Work registered: ${workName} (${work.metadata.title})`);
      
    } catch (error) {
      console.error(`❌ Failed to register work ${workName}:`, error);
      this.onError?.(error as Error, `registerWork:${workName}`);
      throw error;
    }
  }
  
  async unregisterWork(workName: string): Promise<void> {
    const registration = this.availableWorks.get(workName);
    if (!registration) {
      throw new Error(`Work not found: ${workName}`);
    }
    
    // Stop current work if it's the one being unregistered
    if (this.currentWorkName === workName) {
      await this.stopCurrentWork();
    }
    
    // Cleanup the work
    await registration.work.cleanup();
    this.availableWorks.delete(workName);
    
    console.log(`🗑️ Work unregistered: ${workName}`);
  }
  
  // Work performance control
  async startWork(workName: string): Promise<void> {
    if (this.isTransitioning) {
      throw new Error('Cannot start work during transition');
    }
    
    const registration = this.availableWorks.get(workName);
    if (!registration) {
      throw new Error(`Work not found: ${workName}`);
    }
    
    try {
      this.isTransitioning = true;
      
      // Stop current work if any
      if (this.currentWork) {
        await this.stopCurrentWork();
      }
      
      console.log(`🎭 Starting work: ${workName} (${registration.work.metadata.title})`);
      
      // Prepare and start the new work
      await registration.work.prepare();
      await registration.work.perform();
      
      // Update current work
      this.currentWork = registration.work;
      this.currentWorkName = workName;
      registration.lastUsed = new Date();
      
      // Notify listeners
      this.onWorkChanged?.(workName, registration.work);
      
      console.log(`✨ Work started successfully: ${workName}`);
      
    } catch (error) {
      console.error(`❌ Failed to start work ${workName}:`, error);
      this.onError?.(error as Error, `startWork:${workName}`);
      throw error;
    } finally {
      this.isTransitioning = false;
    }
  }
  
  async stopCurrentWork(): Promise<void> {
    if (!this.currentWork || !this.currentWorkName) {
      return;
    }
    
    try {
      console.log(`⏹️ Stopping current work: ${this.currentWorkName}`);
      await this.currentWork.stop();
      
      const prevWorkName = this.currentWorkName;
      this.currentWork = null;
      this.currentWorkName = null;
      
      this.onWorkChanged?.(null, null);
      console.log(`✅ Work stopped: ${prevWorkName}`);
      
    } catch (error) {
      console.error(`❌ Failed to stop current work:`, error);
      this.onError?.(error as Error, 'stopCurrentWork');
      throw error;
    }
  }
  
  async pauseCurrentWork(): Promise<void> {
    if (!this.currentWork) {
      throw new Error('No work is currently running');
    }
    
    await this.currentWork.pause();
    console.log(`⏸️ Work paused: ${this.currentWorkName}`);
  }
  
  async resumeCurrentWork(): Promise<void> {
    if (!this.currentWork) {
      throw new Error('No work is currently running');
    }
    
    await this.currentWork.resume();
    console.log(`▶️ Work resumed: ${this.currentWorkName}`);
  }
  
  // Work information and control
  listAvailableWorks(): Array<{name: string, metadata: WorkMetadata, config: WorkConfig}> {
    const works: Array<{name: string, metadata: WorkMetadata, config: WorkConfig}> = [];
    
    for (const [name, registration] of this.availableWorks) {
      works.push({
        name,
        metadata: registration.work.metadata,
        config: registration.config
      });
    }
    
    return works.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  }
  
  getCurrentWork(): {name: string, work: MusicalWork} | null {
    if (this.currentWork && this.currentWorkName) {
      return {
        name: this.currentWorkName,
        work: this.currentWork
      };
    }
    return null;
  }
  
  getWorkByName(workName: string): MusicalWork | null {
    const registration = this.availableWorks.get(workName);
    return registration ? registration.work : null;
  }
  
  // Current work delegation methods
  async jumpToSection(sectionId: number): Promise<void> {
    if (!this.currentWork) {
      throw new Error('No work is currently running');
    }
    
    await this.currentWork.jumpToSection(sectionId);
    console.log(`🎯 Jumped to section ${sectionId} in ${this.currentWorkName}`);
  }
  
  adjustTempo(bpm: number): void {
    if (!this.currentWork) {
      throw new Error('No work is currently running');
    }
    
    this.currentWork.adjustTempo(bpm);
    console.log(`🎵 Tempo adjusted to ${bpm} BPM in ${this.currentWorkName}`);
  }
  
  setEmergencyMode(enabled: boolean): void {
    if (!this.currentWork) {
      throw new Error('No work is currently running');
    }
    
    this.currentWork.setEmergencyMode(enabled);
    console.log(`🚨 Emergency mode ${enabled ? 'enabled' : 'disabled'} in ${this.currentWorkName}`);
  }
  
  // System status
  getSystemStatus() {
    return {
      currentWork: this.currentWorkName,
      currentState: this.currentWork?.state || null,
      availableWorks: this.listAvailableWorks().length,
      isTransitioning: this.isTransitioning,
      systemReady: this.availableWorks.size > 0
    };
  }
  
  // Emergency controls
  async emergencyStop(): Promise<void> {
    console.log('🚨 EMERGENCY STOP INITIATED');
    
    try {
      // Enable emergency mode if possible
      if (this.currentWork) {
        try {
          this.currentWork.setEmergencyMode(true);
        } catch (error) {
          console.warn('Could not enable emergency mode:', error);
        }
      }
      
      // Force stop current work
      await this.stopCurrentWork();
      
      console.log('🚨 EMERGENCY STOP COMPLETED');
    } catch (error) {
      console.error('🚨 EMERGENCY STOP FAILED:', error);
      // Force reset
      this.currentWork = null;
      this.currentWorkName = null;
      this.isTransitioning = false;
    }
  }
  
  // Cleanup all works
  async shutdown(): Promise<void> {
    console.log('🔄 WorkManager shutdown initiated');
    
    try {
      // Stop current work
      await this.stopCurrentWork();
      
      // Cleanup all registered works
      const cleanupPromises = Array.from(this.availableWorks.entries()).map(
        async ([name, registration]) => {
          try {
            await registration.work.cleanup();
            console.log(`✅ Cleaned up work: ${name}`);
          } catch (error) {
            console.error(`❌ Failed to cleanup work ${name}:`, error);
          }
        }
      );
      
      await Promise.allSettled(cleanupPromises);
      this.availableWorks.clear();
      
      console.log('✅ WorkManager shutdown completed');
    } catch (error) {
      console.error('❌ WorkManager shutdown failed:', error);
      throw error;
    }
  }
}

// Global WorkManager instance
export let globalWorkManager: WorkManager | null = null;

export function initializeWorkManager(): WorkManager {
  if (globalWorkManager) {
    console.warn('WorkManager already initialized');
    return globalWorkManager;
  }
  
  globalWorkManager = new WorkManager();
  
  // Expose to window for debugging
  if (typeof window !== 'undefined') {
    (window as any).workManager = globalWorkManager;
  }
  
  return globalWorkManager;
}

export function getWorkManager(): WorkManager {
  if (!globalWorkManager) {
    throw new Error('WorkManager not initialized. Call initializeWorkManager() first.');
  }
  return globalWorkManager;
}
