/**
 * State Manager - Runtime configuration & statistics
 * Persists layer toggles and tracks security events
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface LayerState {
  content: boolean;
  channel: boolean;
  preLlm: boolean;
  toolArgs: boolean;
  subagents: boolean;
  output: boolean;
}

interface SecurityStats {
  scansTotal: number;
  scansBlocked: number;
  scansPassed: number;
  lastReset: number;
  byLayer: {
    [key: string]: {
      scans: number;
      blocks: number;
    };
  };
  recentBlocks: Array<{
    timestamp: number;
    layer: string;
    reason: string;
    score: number;
  }>;
  pii?: {
    totalScans: number;
    piiDetected: number;
    itemsProcessed: number;
    byType: Record<string, number>;
  };
}

interface RuntimeState {
  piiMode?: 'ignore' | 'mask' | 'remove';
}

export class StateManager {
  private statePath: string;
  private layerState: LayerState;
  private stats: SecurityStats;
  private runtimeState: RuntimeState;
  private saveDebounce: NodeJS.Timeout | null = null;
  private apiDownNotified: boolean = false;
  private lastApiError: number = 0;
  
  constructor(private configLayers: LayerState) {
    this.statePath = path.join(os.homedir(), '.ai-warden-state.json');
    
    // Initialize with config defaults
    this.layerState = { ...configLayers };
    
    // Initialize stats
    this.stats = {
      scansTotal: 0,
      scansBlocked: 0,
      scansPassed: 0,
      lastReset: Date.now(),
      byLayer: {},
      recentBlocks: [],
      pii: {
        totalScans: 0,
        piiDetected: 0,
        itemsProcessed: 0,
        byType: {}
      }
    };
    
    // Initialize runtime state
    this.runtimeState = {};
    
    // Load persisted state
    this.load();
  }
  
  /**
   * Load state from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        
        // Load layer states (override config)
        if (data.layerState) {
          this.layerState = { ...this.layerState, ...data.layerState };
        }
        
        // Load stats
        if (data.stats) {
          this.stats = { ...this.stats, ...data.stats };
        }
        
        console.log('[AI-Warden] Loaded state from', this.statePath);
      }
    } catch (error) {
      console.warn('[AI-Warden] Failed to load state:', error);
    }
  }
  
  /**
   * Save state to disk (debounced)
   */
  private save(): void {
    // Debounce saves (avoid excessive writes)
    if (this.saveDebounce) {
      clearTimeout(this.saveDebounce);
    }
    
    this.saveDebounce = setTimeout(() => {
      try {
        const data = {
          layerState: this.layerState,
          stats: this.stats,
          lastSaved: Date.now()
        };
        
        fs.writeFileSync(this.statePath, JSON.stringify(data, null, 2), 'utf8');
      } catch (error) {
        console.error('[AI-Warden] Failed to save state:', error);
      }
    }, 1000); // 1 second debounce
  }
  
  /**
   * Check if a layer is enabled
   */
  isLayerEnabled(layer: keyof LayerState): boolean {
    return this.layerState[layer];
  }
  
  /**
   * Toggle a layer on/off
   */
  toggleLayer(layer: keyof LayerState, enabled: boolean): boolean {
    if (!(layer in this.layerState)) {
      return false; // Invalid layer
    }
    
    this.layerState[layer] = enabled;
    this.save();
    return true;
  }
  
  /**
   * Get all layer states
   */
  getLayerStates(): LayerState {
    return { ...this.layerState };
  }
  
  /**
   * Record a scan event
   */
  recordScan(params: {
    layer: string;
    blocked: boolean;
    score?: number;
    reason?: string;
  }): void {
    this.stats.scansTotal++;
    
    if (params.blocked) {
      this.stats.scansBlocked++;
      
      // Record recent block
      this.stats.recentBlocks.unshift({
        timestamp: Date.now(),
        layer: params.layer,
        reason: params.reason || 'Unknown',
        score: params.score || 0
      });
      
      // Keep only last 50 blocks
      if (this.stats.recentBlocks.length > 50) {
        this.stats.recentBlocks = this.stats.recentBlocks.slice(0, 50);
      }
    } else {
      this.stats.scansPassed++;
    }
    
    // By-layer stats
    if (!this.stats.byLayer[params.layer]) {
      this.stats.byLayer[params.layer] = { scans: 0, blocks: 0 };
    }
    this.stats.byLayer[params.layer].scans++;
    if (params.blocked) {
      this.stats.byLayer[params.layer].blocks++;
    }
    
    this.save();
  }
  
  /**
   * Get statistics
   */
  getStats(): SecurityStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      scansTotal: 0,
      scansBlocked: 0,
      scansPassed: 0,
      lastReset: Date.now(),
      byLayer: {},
      recentBlocks: []
    };
    this.save();
  }
  
  /**
   * Record API error (for alerting)
   */
  recordApiError(): boolean {
    this.lastApiError = Date.now();
    
    // Only notify once per hour
    if (!this.apiDownNotified || Date.now() - this.lastApiError > 3600_000) {
      this.apiDownNotified = true;
      return true; // Should notify
    }
    
    return false; // Already notified recently
  }
  
  /**
   * Clear API down status (when API recovers)
   */
  clearApiError(): void {
    if (this.apiDownNotified) {
      this.apiDownNotified = false;
      // Could trigger "API recovered" notification here
    }
  }
  
  /**
   * Check if API has been down recently
   */
  isApiDown(): boolean {
    // Consider API down if error within last 5 minutes
    return Date.now() - this.lastApiError < 300_000;
  }
  
  /**
   * Get formatted statistics for display
   */
  getFormattedStats(): string {
    const { scansTotal, scansBlocked, scansPassed, byLayer, recentBlocks } = this.stats;
    const blockRate = scansTotal > 0 ? ((scansBlocked / scansTotal) * 100).toFixed(1) : '0.0';
    
    const lines = [
      '📊 **Security Statistics**',
      '',
      '**Overall:**',
      `Total Scans: ${scansTotal}`,
      `Blocked: ${scansBlocked} (${blockRate}%)`,
      `Passed: ${scansPassed}`,
      '',
      '**By Layer:**'
    ];
    
    // Sort layers by scan count
    const sortedLayers = Object.entries(byLayer).sort((a, b) => b[1].scans - a[1].scans);
    
    for (const [layer, data] of sortedLayers) {
      const layerBlockRate = data.scans > 0 ? ((data.blocks / data.scans) * 100).toFixed(1) : '0.0';
      lines.push(`• ${layer}: ${data.scans} scans, ${data.blocks} blocked (${layerBlockRate}%)`);
    }
    
    if (recentBlocks.length > 0) {
      lines.push('', '**Recent Blocks (Last 5):**');
      for (const block of recentBlocks.slice(0, 5)) {
        const timeAgo = this.formatTimeAgo(Date.now() - block.timestamp);
        lines.push(`• ${timeAgo}: ${block.layer} - ${block.reason.substring(0, 50)}...`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Format time ago (simple)
   */
  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }
  
  /**
   * Get PII mode (runtime or default)
   */
  getPIIMode(): 'ignore' | 'mask' | 'remove' {
    return this.runtimeState.piiMode || 'mask'; // Default: mask
  }
  
  /**
   * Set PII mode
   */
  setPIIMode(mode: 'ignore' | 'mask' | 'remove'): void {
    this.runtimeState.piiMode = mode;
    this.save();
  }
  
  /**
   * Record PII detection
   */
  recordPII(count: number, types: Record<string, number>): void {
    if (!this.stats.pii) {
      this.stats.pii = {
        totalScans: 0,
        piiDetected: 0,
        itemsProcessed: 0,
        byType: {}
      };
    }
    
    this.stats.pii.totalScans++;
    if (count > 0) {
      this.stats.pii.piiDetected++;
      this.stats.pii.itemsProcessed += count;
      
      // Aggregate by type
      for (const [type, typeCount] of Object.entries(types)) {
        this.stats.pii.byType[type] = (this.stats.pii.byType[type] || 0) + typeCount;
      }
    }
    
    this.save();
  }
  
  /**
   * Get PII statistics
   */
  getPIIStats() {
    return this.stats.pii || {
      totalScans: 0,
      piiDetected: 0,
      itemsProcessed: 0,
      byType: {}
    };
  }
}
