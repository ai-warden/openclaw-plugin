/**
 * Warning Engine - User-facing security alerts
 * Decides when and what to warn users about threats/blocks
 */

export interface ThreatEvent {
  type: 'INPUT_THREAT' | 'ACTION_BLOCKED' | 'CONTENT_THREAT';
  layer: number;
  threat?: any;
  action?: any;
  sessionId: string;
  timestamp?: number;
}

export interface Warning {
  template: keyof typeof WARNING_TEMPLATES;
  details: any;
  delay?: number;
}

export const SEVERITY = {
  INFO: { icon: 'ℹ️', color: 'blue' },
  CAUTION: { icon: '⚠️', color: 'yellow' },
  BLOCKED: { icon: '⛔', color: 'orange' },
  CRITICAL: { icon: '🚨', color: 'red' }
} as const;

export const WARNING_TEMPLATES = {
  // Scenario 1: Suspicious input → Dangerous tool call
  SUSPICIOUS_INPUT_BLOCKED_ACTION: {
    severity: 'BLOCKED' as const,
    message: 'Security block activated',
    explain: (details: any) => 
      `Your recent message contained unusual patterns, and the AI just attempted to ${details.action} which was blocked for safety.`,
    suggestion: "If you didn't expect this behavior, please report this conversation.",
    expandable: (details: any) => `
Blocked action: ${details.toolName}(${JSON.stringify(details.toolArgs)})
Detection: ${details.inputThreat}
Risk level: ${details.riskScore}/10
    `.trim()
  },

  // Scenario 2: Normal input → AI attempts data exfil
  UNEXPECTED_DANGEROUS_ACTION: {
    severity: 'CRITICAL' as const,
    message: 'Unexpected security block',
    explain: (details: any) =>
      `The AI attempted to ${details.action} without being asked. This was blocked automatically.`,
    suggestion: "This may indicate the conversation was compromised. Consider starting a fresh session and reporting this incident.",
    expandable: (details: any) => `
Blocked action: ${details.toolName}
Reason: ${details.reason}
Previous input: "${details.lastUserMessage?.substring(0, 100) || 'N/A'}..."
    `.trim()
  },

  // Scenario 3: Suspicious input → No follow-up yet
  SUSPICIOUS_INPUT_DETECTED: {
    severity: 'CAUTION' as const,
    message: 'Unusual input detected',
    explain: () =>
      'Your message contained patterns that could be attempting to manipulate the AI.',
    suggestion: "If this was intentional testing, you can continue. Otherwise, rephrase your message or report any unusual AI responses.",
    expandable: (details: any) => `
Detection type: ${details.threatType}
Confidence: ${details.confidence}%
Pattern: ${details.pattern || 'N/A'}
    `.trim()
  },

  // Scenario 4: File read → Contains prompt injection
  MALICIOUS_CONTENT_IN_FILE: {
    severity: 'BLOCKED' as const,
    message: 'File contains suspicious content',
    explain: (details: any) =>
      `The file "${details.filename}" contains patterns designed to manipulate AI behavior and was not loaded.`,
    suggestion: "Scan this file with antivirus software. It may have been compromised or deliberately crafted to attack AI systems.",
    expandable: (details: any) => `
File path: ${details.filepath}
Threat type: ${details.threatType}
Location: ${details.lineNumber ? `Line ${details.lineNumber}` : 'N/A'}
Pattern: "${details.snippet || 'N/A'}"
    `.trim()
  },

  // Scenario 5: Multiple failed attacks
  REPEATED_ATTACKS: {
    severity: 'CRITICAL' as const,
    message: 'Multiple security blocks detected',
    explain: (details: any) =>
      `${details.count} suspicious actions have been blocked in this conversation.`,
    suggestion: "Start a fresh conversation immediately. If you didn't initiate these attempts, your account or files may be compromised.",
    expandable: (details: any) => `
Blocked attempts: ${details.count}
Time span: ${details.timeSpan}
Types: ${details.types?.join(', ') || 'N/A'}
Last block: ${details.lastBlock}
    `.trim()
  },

  // Additional: Low-risk but noteworthy
  POLICY_BLOCK: {
    severity: 'INFO' as const,
    message: 'Action blocked by policy',
    explain: (details: any) =>
      `The requested action (${details.action}) is restricted by security policy.`,
    suggestion: "This is normal for sensitive operations. Use approved methods or request access if needed.",
    expandable: (details: any) => `
Policy: ${details.policyName || 'N/A'}
Restriction: ${details.restriction || 'N/A'}
    `.trim()
  }
} as const;

interface SessionState {
  inputThreats: Array<{ timestamp: number; [key: string]: any }>;
  blockedActions: Array<{ timestamp: number; [key: string]: any }>;
  lastWarningTime: number | null;
  warningCount: number;
  lastUserMessage?: string;
}

export class WarningDecisionEngine {
  private sessionStates = new Map<string, SessionState>();
  
  // Config
  private readonly MIN_TIME_BETWEEN_WARNINGS = 3000; // 3s
  private readonly MAX_WARNINGS_PER_SESSION = 10;
  private readonly REPEAT_ATTACK_THRESHOLD = 3;
  private readonly INPUT_THREAT_MIN_CONFIDENCE = 0.7;
  private readonly WAIT_FOR_FOLLOWUP_MS = 2000;
  private readonly LINK_WINDOW_MS = 10000; // 10s

  private getSessionState(sessionId: string): SessionState {
    if (!this.sessionStates.has(sessionId)) {
      this.sessionStates.set(sessionId, {
        inputThreats: [],
        blockedActions: [],
        lastWarningTime: null,
        warningCount: 0
      });
    }
    return this.sessionStates.get(sessionId)!;
  }

  shouldWarn(event: ThreatEvent): Warning | null {
    const state = this.getSessionState(event.sessionId);
    
    // Throttle warnings
    if (state.lastWarningTime && Date.now() - state.lastWarningTime < this.MIN_TIME_BETWEEN_WARNINGS) {
      return null;
    }
    
    // Max warnings per session
    if (state.warningCount >= this.MAX_WARNINGS_PER_SESSION) {
      return null;
    }
    
    // Track the event
    this.trackEvent(event, state);
    
    // Decision tree
    switch (event.type) {
      case 'INPUT_THREAT':
        return this.handleInputThreat(event.threat, state);
      case 'ACTION_BLOCKED':
        return this.handleBlockedAction(event.action, state);
      case 'CONTENT_THREAT':
        return this.handleContentThreat(event.threat);
      default:
        return null;
    }
  }

  private handleInputThreat(threat: any, state: SessionState): Warning | null {
    // Check if there's a recent blocked action linked to this input
    const recentBlock = this.findRecentLinkedBlock(threat.timestamp || Date.now(), state);
    
    if (recentBlock) {
      // Scenario 1: Input threat + blocked action
      return {
        template: 'SUSPICIOUS_INPUT_BLOCKED_ACTION',
        details: {
          action: this.humanizeAction(recentBlock.toolName),
          toolName: recentBlock.toolName,
          toolArgs: recentBlock.toolArgs,
          inputThreat: threat.type || 'unknown',
          riskScore: recentBlock.riskScore || 8
        }
      };
    }
    
    // Scenario 3: Input threat only (if high confidence)
    const confidence = threat.confidence || threat.risk || 0;
    if (confidence >= this.INPUT_THREAT_MIN_CONFIDENCE) {
      return {
        template: 'SUSPICIOUS_INPUT_DETECTED',
        details: {
          threatType: threat.type || 'prompt_injection',
          confidence: Math.round(confidence * 100),
          pattern: threat.pattern || threat.message
        },
        delay: this.WAIT_FOR_FOLLOWUP_MS
      };
    }
    
    return null;
  }

  private handleBlockedAction(action: any, state: SessionState): Warning | null {
    const hasRecentSuspiciousInput = this.hasRecentThreat(5000, state);
    
    if (!hasRecentSuspiciousInput) {
      // Scenario 2: No suspicious input, but dangerous action
      return {
        template: 'UNEXPECTED_DANGEROUS_ACTION',
        details: {
          action: this.humanizeAction(action.toolName),
          toolName: action.toolName,
          reason: action.blockReason || action.reason || 'security policy',
          lastUserMessage: state.lastUserMessage
        }
      };
    }
    
    // Check for repeated attacks
    if (state.blockedActions.length >= this.REPEAT_ATTACK_THRESHOLD) {
      // Scenario 5: Multiple attacks
      return {
        template: 'REPEATED_ATTACKS',
        details: {
          count: state.blockedActions.length,
          timeSpan: this.getTimeSpan(state),
          types: [...new Set(state.blockedActions.map((a: any) => a.type || a.toolName))],
          lastBlock: action.toolName
        }
      };
    }
    
    // Already handled by Scenario 1
    return null;
  }

  private handleContentThreat(threat: any): Warning | null {
    // Scenario 4: File/content contains malicious patterns
    if (threat.source === 'file' || threat.filename) {
      return {
        template: 'MALICIOUS_CONTENT_IN_FILE',
        details: {
          filename: threat.filename || 'unknown',
          filepath: threat.filepath || threat.filename,
          threatType: threat.type || 'prompt_injection',
          lineNumber: threat.location?.line,
          snippet: threat.snippet
        }
      };
    }
    
    return null;
  }

  private trackEvent(event: ThreatEvent, state: SessionState): void {
    const timestamp = event.timestamp || Date.now();
    
    if (event.type === 'INPUT_THREAT' && event.threat) {
      state.inputThreats.push({
        timestamp,
        ...event.threat
      });
    } else if (event.type === 'ACTION_BLOCKED' && event.action) {
      state.blockedActions.push({
        timestamp,
        ...event.action
      });
    }
  }

  private findRecentLinkedBlock(inputTimestamp: number, state: SessionState): any {
    return state.blockedActions.find(
      action => action.timestamp > inputTimestamp && 
                action.timestamp - inputTimestamp < this.LINK_WINDOW_MS
    );
  }

  private hasRecentThreat(windowMs: number, state: SessionState): boolean {
    const now = Date.now();
    return state.inputThreats.some(
      t => now - t.timestamp < windowMs
    );
  }

  private humanizeAction(toolName: string): string {
    const humanized: Record<string, string> = {
      'read': 'access files',
      'write': 'modify files',
      'exec': 'run commands',
      'web_fetch': 'contact external websites',
      'message': 'send messages',
      'browser': 'control the browser'
    };
    return humanized[toolName] || `use the ${toolName} tool`;
  }

  private getTimeSpan(state: SessionState): string {
    if (state.blockedActions.length < 2) return 'N/A';
    
    const first = state.blockedActions[0].timestamp;
    const last = state.blockedActions[state.blockedActions.length - 1].timestamp;
    const diffMin = Math.round((last - first) / 60000);
    return diffMin < 1 ? 'less than 1 minute' : `${diffMin} minutes`;
  }

  markWarningSent(sessionId: string): void {
    const state = this.getSessionState(sessionId);
    state.warningCount++;
    state.lastWarningTime = Date.now();
  }

  updateLastUserMessage(sessionId: string, message: string): void {
    const state = this.getSessionState(sessionId);
    state.lastUserMessage = message;
  }

  clearSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }

  formatWarning(warning: Warning): string {
    const tmpl = WARNING_TEMPLATES[warning.template];
    const { icon } = SEVERITY[tmpl.severity];
    
    const explain = typeof tmpl.explain === 'function' 
      ? tmpl.explain(warning.details) 
      : tmpl.explain;
    
    let msg = `${icon} **${tmpl.message}**\n\n${explain}\n\n💡 ${tmpl.suggestion}`;
    
    // Add expandable details
    if (tmpl.expandable) {
      const expandedDetails = typeof tmpl.expandable === 'function'
        ? tmpl.expandable(warning.details)
        : tmpl.expandable;
      msg += `\n\n<details><summary>Technical details</summary>\n\n\`\`\`\n${expandedDetails}\n\`\`\`\n</details>`;
    }
    
    return msg;
  }
}
