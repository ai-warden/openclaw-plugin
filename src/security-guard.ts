/**
 * Security Guard - Message blocking via replyResolver
 * 
 * This is the WORKING solution: wrap Moltbot's getReplyFromConfig
 * with security checks that run BEFORE the LLM is invoked.
 */

import type { SecurityValidator } from './validator.js';
import type { StateManager } from './state-manager.js';

interface SecurityGuardConfig {
  validator: SecurityValidator;
  stateManager: StateManager;
  config: any;
}

/**
 * Create security guard that wraps replyResolver
 */
export function createSecurityGuard(guardConfig: SecurityGuardConfig) {
  const { validator, stateManager, config } = guardConfig;

  /**
   * Check if message contains threats
   */
  async function checkMessage(ctx: any): Promise<{ blocked: boolean; reason?: string; risk?: number }> {
    // Check if layer is enabled
    if (!stateManager.isLayerEnabled('channel')) {
      return { blocked: false };
    }

    // Extract message content
    const content = (
      ctx.Body || 
      ctx.RawBody || 
      ctx.BodyForCommands || 
      ctx.BodyForAgent ||
      ctx.CommandBody ||
      ''
    ).trim();

    if (!content) {
      return { blocked: false };
    }

    try {
      console.log(`[AI-Warden] SecurityGuard: Checking message: "${content.substring(0, 50)}..."`);

      // Scan with AI-Warden API
      const result = await validator.scanContent({
        content,
        source: 'security_guard',
        metadata: { 
          channelId: ctx.channelId,
          userId: ctx.userId 
        }
      });

      const shouldBlock = !result.safe;

      console.log(`[AI-Warden] SecurityGuard result: safe=${result.safe}, risk=${result.risk}, shouldBlock=${shouldBlock}`);

      // Record scan
      stateManager.recordScan({
        layer: 'channel',
        blocked: shouldBlock,
        score: result.risk || 0,
        reason: result.message
      });

      if (shouldBlock) {
        return {
          blocked: true,
          reason: result.message || 'Security policy violation',
          risk: result.risk || 0
        };
      }

      return { blocked: false };

    } catch (error: any) {
      console.error('[AI-Warden] SecurityGuard error:', error.message);

      // Fail-open: allow on error
      if (config.policy?.failOpen !== false) {
        return { blocked: false };
      }

      // Fail-closed: block on error
      return {
        blocked: true,
        reason: 'Security validation unavailable'
      };
    }
  }

  /**
   * Wrap original replyResolver with security checks
   */
  function wrapResolver(originalResolver: Function) {
    return async function secureResolver(ctx: any, ...args: any[]) {
      // Check for threats BEFORE calling original resolver
      const check = await checkMessage(ctx);

      if (check.blocked) {
        const blockMessage = (check.risk || 0) > 50
          ? undefined  // Silent block (no reply)
          : '⚠️ Message blocked by security filters.';

        console.log('[AI-Warden] 🛡️ SECURITY GUARD BLOCKED MESSAGE:', check.reason);

        // Return early - LLM is NEVER invoked!
        return {
          reply: blockMessage ? { text: blockMessage } : undefined,
          // Mark as handled so no further processing happens
          handled: true
        };
      }

      console.log('[AI-Warden] ✅ SecurityGuard: Message passed, calling original resolver');

      // Message is safe, call original resolver (which invokes LLM)
      return originalResolver(ctx, ...args);
    };
  }

  return {
    checkMessage,
    wrapResolver
  };
}
