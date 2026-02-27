/**
 * Telegram Message Blocker - Wrap dispatchTelegramMessage
 * 
 * This is the WORKING solution found by desperate-subagent:
 * Wrap Telegram's message dispatch function at runtime via gateway_start hook.
 */

import type { SecurityValidator } from './validator.js';
import type { StateManager } from './state-manager.js';

interface TelegramBlockerConfig {
  validator: SecurityValidator;
  stateManager: StateManager;
  config: any;
}

/**
 * Create Telegram message blocker
 */
export function createTelegramBlocker(blockerConfig: TelegramBlockerConfig) {
  const { validator, stateManager, config } = blockerConfig;
  
  /**
   * Check if message should be blocked
   */
  async function shouldBlockMessage(params: any): Promise<{ block: boolean; reason?: string; risk?: number }> {
    // Check if layer is enabled
    if (!stateManager.isLayerEnabled('channel')) {
      return { block: false };
    }
    
    try {
      // Extract message from Telegram params
      const message = params?.context?.ctxPayload?.message;
      const text = message?.text || message?.caption || '';
      
      if (!text.trim()) {
        return { block: false };
      }
      
      console.log(`[AI-Warden] TelegramBlocker: Checking message: "${text.substring(0, 50)}..."`);
      
      // Scan with AI-Warden
      const result = await validator.scanContent({
        content: text,
        source: 'telegram_dispatch',
        metadata: {
          chatId: message?.chat?.id,
          userId: message?.from?.id,
          messageId: message?.message_id
        }
      });
      
      const shouldBlock = !result.safe;
      
      console.log(`[AI-Warden] TelegramBlocker result: safe=${result.safe}, risk=${result.risk}, shouldBlock=${shouldBlock}`);
      
      // Record scan
      stateManager.recordScan({
        layer: 'channel',
        blocked: shouldBlock,
        score: result.risk || 0,
        reason: result.message
      });
      
      // Flag session if threat detected (for Layer 3 output blocking)
      if (shouldBlock) {
        const sessionKey = params?.sessionKey;
        if (sessionKey) {
          stateManager.flagSuspiciousSession(sessionKey, {
            reason: result.message,
            risk: result.risk,
            timestamp: Date.now()
          });
        }
      }
      
      return {
        block: shouldBlock,
        reason: result.message,
        risk: result.risk
      };
      
    } catch (error: any) {
      console.error('[AI-Warden] TelegramBlocker error:', error.message);
      
      // Fail-open on error
      if (config.policy?.failOpen !== false) {
        return { block: false };
      }
      
      return {
        block: true,
        reason: 'Security validation unavailable'
      };
    }
  }
  
  /**
   * Wrap dispatchTelegramMessage function
   */
  function wrapDispatch(originalDispatch: Function) {
    return async function wrappedDispatch(params: any) {
      // Check for threats BEFORE dispatching
      const check = await shouldBlockMessage(params);
      
      if (check.block) {
        console.log(`[AI-Warden] 🚫 TELEGRAM MESSAGE BLOCKED: ${check.reason}`);
        
        // Silent block - no reply sent
        // Message never reaches LLM!
        return;
      }
      
      console.log('[AI-Warden] ✅ TelegramBlocker: Message passed, dispatching');
      
      // Message is safe, call original dispatch (which invokes LLM)
      return originalDispatch(params);
    };
  }
  
  return {
    shouldBlockMessage,
    wrapDispatch
  };
}
