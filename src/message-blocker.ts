/**
 * AI-Warden Message Blocker - Command Handler
 * 
 * This is a command handler (not a hook!) that can actually BLOCK messages.
 * Runs BEFORE the LLM and can return early to stop execution.
 */

import type { StateManager } from './state-manager.js';
import type { SecurityValidator } from './validator.js';

interface BlockerParams {
  ctx: any;
  cfg: any;
  sessionKey?: string;
}

/**
 * Create message blocker handler
 */
export function createMessageBlocker(
  validator: SecurityValidator,
  stateManager: StateManager,
  config: any
) {
  
  /**
   * Command handler function - intercepts BEFORE LLM
   */
  return async function handleAIWardenBlock(params: BlockerParams, allowTextCommands: boolean) {
    // Check if Layer 1 is enabled
    if (!stateManager.isLayerEnabled('channel')) {
      return null; // Layer disabled, allow through
    }
    
    const { ctx, sessionKey } = params;
    
    // Extract message content
    const content = (ctx.BodyForCommands ?? ctx.RawBody ?? ctx.Body ?? "").trim();
    
    if (!content) {
      return null; // Empty message, allow through
    }
    
    try {
      console.log(`[AI-Warden] Command Handler: Scanning message: "${content.substring(0, 50)}..."`);
      
      // Scan with AI-Warden API
      const result = await validator.scanContent({
        content,
        source: 'command_handler',
        metadata: { 
          sessionKey,
          channelId: ctx.channelId,
          userId: ctx.userId 
        }
      });
      
      const shouldBlock = !result.safe;
      
      console.log(`[AI-Warden] Command Handler result: safe=${result.safe}, risk=${result.risk}, shouldBlock=${shouldBlock}`);
      
      // Record scan
      stateManager.recordScan({
        layer: 'channel',
        blocked: shouldBlock,
        score: result.risk || 0,
        reason: result.message
      });
      
      if (shouldBlock) {
        const blockMessage = (result.risk || 0) > 50
          ? '[AI-Warden] Message blocked by security policy'
          : `⚠️ Message blocked: ${result.message || 'Security policy violation'}`;
        
        console.log('[AI-Warden] ⛔️ COMMAND HANDLER BLOCKING MESSAGE:', blockMessage);
        
        // CRITICAL: Return with shouldContinue=false to STOP execution
        return {
          shouldContinue: false,  // STOP PROCESSING
          reply: undefined        // NO REPLY (silent block)
          // Alternative: reply: { text: blockMessage } to inform user
        };
      }
      
      console.log('[AI-Warden] ✅ Command Handler: Message passed validation');
      
      // Message is safe, continue processing
      return null;
      
    } catch (error: any) {
      console.error('[AI-Warden] ❌ Command Handler error:', error.message);
      
      // Fail-open: allow message through on error
      if (config.policy?.failOpen !== false) {
        console.log('[AI-Warden] Allowing message through (fail-open on error)');
        return null;
      }
      
      // Fail-closed: block on error
      return {
        shouldContinue: false,
        reply: { text: '⚠️ Security validation unavailable. Please try again later.' }
      };
    }
  };
}
