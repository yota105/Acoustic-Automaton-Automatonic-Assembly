/**
 * Event Bus
 * Inter-component communication system for the work framework
 */

import { AudioInputEvent, TimingEvent, UserAction } from './musicalWork.js';

export type EventCallback<T = any> = (data: T) => void;

export interface EngineEvent {
  type: string;
  timestamp: number;
  source: string;
  data: any;
}

// Predefined engine event types
export interface EngineEvents {
  // Audio events
  'audio:input': AudioInputEvent;
  'audio:output-ready': { device: string };
  'audio:device-changed': { type: 'input' | 'output', device: string };
  'audio:level-changed': { channel: string, level: number };
  
  // Visual events
  'visual:renderer-ready': { renderer: string };
  'visual:window-created': { windowId: string, type: string };
  'visual:window-closed': { windowId: string };
  'visual:frame-rendered': { renderer: string, frameTime: number };
  
  // Timing events
  'timing:beat': TimingEvent;
  'timing:measure': TimingEvent;
  'timing:section-change': TimingEvent;
  'timing:tempo-change': TimingEvent;
  
  // Work events
  'work:loaded': { workName: string };
  'work:started': { workName: string };
  'work:stopped': { workName: string };
  'work:section-changed': { workName: string, sectionId: number };
  
  // System events
  'system:ready': {};
  'system:error': { error: Error, context: string };
  'system:emergency': { reason: string };
  
  // User events
  'user:action': UserAction;
  'user:trigger': { trigger: string, data?: any };
}

export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();
  private eventHistory: EngineEvent[] = [];
  private maxHistorySize = 1000;
  
  constructor() {
    console.log('🚌 EventBus initialized');
  }
  
  // Subscribe to events
  on<K extends keyof EngineEvents>(eventType: K, callback: EventCallback<EngineEvents[K]>): void;
  on(eventType: string, callback: EventCallback): void;
  on(eventType: string, callback: EventCallback): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add(callback);
    console.log(`📡 Subscribed to event: ${eventType} (${this.listeners.get(eventType)!.size} listeners)`);
  }
  
  // Unsubscribe from events
  off<K extends keyof EngineEvents>(eventType: K, callback: EventCallback<EngineEvents[K]>): void;
  off(eventType: string, callback: EventCallback): void;
  off(eventType: string, callback: EventCallback): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
      console.log(`📡 Unsubscribed from event: ${eventType} (${listeners.size} listeners remaining)`);
      
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }
  
  // Subscribe once
  once<K extends keyof EngineEvents>(eventType: K, callback: EventCallback<EngineEvents[K]>): void;
  once(eventType: string, callback: EventCallback): void;
  once(eventType: string, callback: EventCallback): void {
    const onceCallback = (data: any) => {
      callback(data);
      this.off(eventType, onceCallback);
    };
    
    this.on(eventType, onceCallback);
  }
  
  // Emit events
  emit<K extends keyof EngineEvents>(eventType: K, data: EngineEvents[K], source?: string): void;
  emit(eventType: string, data: any, source?: string): void;
  emit(eventType: string, data: any, source: string = 'unknown'): void {
    const event: EngineEvent = {
      type: eventType,
      timestamp: performance.now(),
      source,
      data
    };
    
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    
    // Notify listeners
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      console.log(`📢 Emitting event: ${eventType} (${listeners.size} listeners)`);
      
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in event listener for ${eventType}:`, error);
          // Emit error event
          this.emit('system:error', { error: error as Error, context: `eventListener:${eventType}` }, 'EventBus');
        }
      });
    } else {
      console.log(`📢 Emitting event: ${eventType} (no listeners)`);
    }
  }
  
  // Get event history
  getEventHistory(eventType?: string, limit?: number): EngineEvent[] {
    let events = eventType 
      ? this.eventHistory.filter(e => e.type === eventType)
      : this.eventHistory;
    
    if (limit) {
      events = events.slice(-limit);
    }
    
    return events;
  }
  
  // Get listener count
  getListenerCount(eventType: string): number {
    return this.listeners.get(eventType)?.size || 0;
  }
  
  // Get all event types with listeners
  getActiveEventTypes(): string[] {
    return Array.from(this.listeners.keys());
  }
  
  // Wait for event
  waitFor<K extends keyof EngineEvents>(eventType: K, timeout?: number): Promise<EngineEvents[K]>;
  waitFor(eventType: string, timeout?: number): Promise<any>;
  waitFor(eventType: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = timeout > 0 ? setTimeout(() => {
        this.off(eventType, listener);
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout) : null;
      
      const listener = (data: any) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(data);
      };
      
      this.once(eventType, listener);
    });
  }
  
  // Clear all listeners
  clear(): void {
    this.listeners.clear();
    this.eventHistory = [];
    console.log('🚌 EventBus cleared');
  }
  
  // Debug information
  getDebugInfo() {
    const listenerCounts: Record<string, number> = {};
    for (const [eventType, listeners] of this.listeners) {
      listenerCounts[eventType] = listeners.size;
    }
    
    return {
      totalEventTypes: this.listeners.size,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0),
      listenerCounts,
      eventHistorySize: this.eventHistory.length,
      recentEvents: this.eventHistory.slice(-10).map(e => ({
        type: e.type,
        source: e.source,
        timestamp: e.timestamp
      }))
    };
  }
}

// Global EventBus instance
export let globalEventBus: EventBus | null = null;

export function initializeEventBus(): EventBus {
  if (globalEventBus) {
    console.warn('EventBus already initialized');
    return globalEventBus;
  }
  
  globalEventBus = new EventBus();
  
  // Expose to window for debugging
  if (typeof window !== 'undefined') {
    (window as any).eventBus = globalEventBus;
  }
  
  return globalEventBus;
}

export function getEventBus(): EventBus {
  if (!globalEventBus) {
    throw new Error('EventBus not initialized. Call initializeEventBus() first.');
  }
  return globalEventBus;
}

// Utility functions for common events
export class EventHelpers {
  static emitAudioInput(channel: string, amplitude: number, frequency?: number, rawData?: Float32Array) {
    getEventBus().emit('audio:input', {
      channel,
      frequency,
      amplitude,
      timestamp: performance.now(),
      rawData
    }, 'AudioEngine');
  }
  
  static emitTiming(type: TimingEvent['type'], data: any) {
    getEventBus().emit('timing:beat', {
      type,
      timestamp: performance.now(),
      data
    }, 'TimingEngine');
  }
  
  static emitUserAction(type: string, target?: string, data?: any) {
    getEventBus().emit('user:action', {
      type,
      target,
      data,
      timestamp: performance.now()
    }, 'UserInterface');
  }
  
  static emitSystemError(error: Error, context: string) {
    getEventBus().emit('system:error', { error, context }, 'System');
  }
}
