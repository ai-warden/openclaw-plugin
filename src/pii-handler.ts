/**
 * PII Handler - Wrapper around ai-warden PII detection
 */

// @ts-ignore - ai-warden doesn't have types yet
import { PIIDetector, PII_MODES } from 'ai-warden/src/pii/index.js';

export type PIIMode = 'ignore' | 'mask' | 'remove';

export interface PIIResult {
  hasPII: boolean;
  count: number;
  modified: string;
  original: string;
  types: Record<string, number>;
}

export class PIIHandler {
  private detector: any;
  
  constructor(private mode: PIIMode = 'mask') {
    this.updateDetector();
  }
  
  /**
   * Update detector mode
   */
  setMode(mode: PIIMode): void {
    this.mode = mode;
    this.updateDetector();
  }
  
  /**
   * Recreate detector with current mode
   */
  private updateDetector(): void {
    const modeMap = {
      'ignore': PII_MODES.IGNORE,
      'mask': PII_MODES.MASK,
      'remove': PII_MODES.REMOVE
    };
    
    this.detector = new PIIDetector({ mode: modeMap[this.mode] });
  }
  
  /**
   * Detect and process PII in text
   */
  process(text: string): PIIResult {
    const result = this.detector.detect(text);
    
    // Count by type (extract from modified text labels)
    const types: Record<string, number> = {};
    if (result.hasPII && this.mode === 'mask') {
      // Count occurrences of each label in modified text
      const labels = result.modified.match(/\[(EMAIL|SSN|CREDIT_CARD|PHONE|IP_ADDRESS|IBAN|PASSPORT|DRIVER_LICENSE|PERSONNUMMER|FODSELSNUMMER|CPR|HENKILOTUNNUS)\]/g) || [];
      for (const label of labels) {
        const type = label.slice(1, -1); // Remove [ ]
        types[type] = (types[type] || 0) + 1;
      }
    }
    
    return {
      hasPII: result.hasPII || false,
      count: result.count || 0,
      modified: result.modified || text,
      original: text,
      types
    };
  }
  
  /**
   * Quick check if text has PII
   */
  hasPII(text: string): boolean {
    return this.detector.hasPII(text);
  }
}
