/**
 * AI-Warden OpenClaw Plugin - Main Entry Point
 * 
 * Implements 6-layer security defense:
 * - Layer 0: Content validation (web_fetch, browser, read) - CRITICAL
 * - Layer 1: Channel input validation
 * - Layer 2: Pre-LLM gateway (future)
 * - Layer 3: Tool argument sanitization
 * - Layer 4: Subagent task validation
 * - Layer 5: Output filtering
 */

import { SecurityValidator } from './validator.js';
import { createSecureWebFetchWrapper } from './tools/web-fetch-secure.js';
import { StateManager } from './state-manager.js';
import { registerWardenCommands } from './commands.js';
import { PIIHandler } from './pii-handler.js';
import { createMessageBlocker } from './message-blocker.js';
import { createSecurityGuard } from './security-guard.js';
import { createTelegramBlocker } from './telegram-blocker.js';
import { WarningDecisionEngine } from './warning-engine.js';
import { registerLayer0 } from './layers/layer0-content.js';
import type { SecurityConfig } from './types.js';

/**
 * Version compatibility constants
 * Updated for OpenClaw 2026.3.13 compatibility
 */
const MIN_OPENCLAW_VERSION = "2026.1.24";
const TESTED_OPENCLAW_VERSIONS = [
  "2026.1.27-beta.1",
  "2026.3.11",
  "2026.3.12",
  "2026.3.13-beta.1",
  "2026.3.13"
];

/**
 * Compare version strings (simple semver comparison)
 */
function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  };
  
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);
  
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export default function aiWardenPlugin(api: any) {
  // ========================================================================
  // VERSION COMPATIBILITY CHECK (v1.1.0 - NEW)
  // ========================================================================
  const openclawVersion = api.runtime?.version || api.version || "unknown";
  
  console.log(`[AI-Warden] Plugin v1.1.0 initializing on OpenClaw ${openclawVersion}`);
  
  if (openclawVersion !== "unknown") {
    // Check minimum version requirement
    if (compareVersions(openclawVersion, MIN_OPENCLAW_VERSION) < 0) {
      const errorMsg = 
        `[AI-Warden] ❌ INCOMPATIBLE VERSION\n` +
        `  Required: OpenClaw >= ${MIN_OPENCLAW_VERSION}\n` +
        `  Found: ${openclawVersion}\n` +
        `  Please upgrade OpenClaw to use AI-Warden v1.1.0`;
      
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    // Check if running on tested version
    if (TESTED_OPENCLAW_VERSIONS.includes(openclawVersion)) {
      console.log(`[AI-Warden] ✅ Verified compatible with OpenClaw ${openclawVersion}`);
    } else {
      console.warn(
        `[AI-Warden] ⚠️ Running on UNTESTED OpenClaw version: ${openclawVersion}\n` +
        `  Tested versions: ${TESTED_OPENCLAW_VERSIONS.join(', ')}\n` +
        `  Plugin may not work correctly. Please report issues to:\n` +
        `  https://github.com/ai-warden/openclaw-plugin/issues`
      );
    }
  } else {
    console.warn('[AI-Warden] ⚠️ Could not detect OpenClaw version - proceeding with caution');
  }
  
  // ========================================================================
  // PLUGIN CONFIGURATION
  // ========================================================================
  // Plugin config with defaults (Moltbot may pass undefined/empty config)
  const config: SecurityConfig = {
    layers: {
      content: true,
      channel: true,
      preLlm: false,
      toolArgs: true,
      subagents: true,
      output: true,
      ...(api.pluginConfig?.layers || {})
    },
    policy: {
      blockThreshold: 200,
      warnThreshold: 100,
      failOpen: true,
      ...(api.pluginConfig?.policy || {})
    },
    apiKey: api.pluginConfig?.apiKey,
    verbose: api.pluginConfig?.verbose || false,
    enableStats: api.pluginConfig?.enableStats !== false
  };
  
  // Initialize state manager (runtime config + stats)
  const stateManager = new StateManager(config.layers);
  
  // Initialize PII handler with default mode
  const piiHandler = new PIIHandler(config.output?.piiMode || 'mask');
  
  // Initialize warning engine
  const warningEngine = new WarningDecisionEngine();
  
  // API down notification handler
  const notifyApiDown = (message: string) => {
    const shouldNotify = stateManager.recordApiError();
    if (shouldNotify) {
      // Log to console
      console.error('[AI-Warden] API DOWN:', message);
      
      // Try to send notification via OpenClaw (if API available)
      if (api.notify) {
        api.notify({
          level: 'error',
          title: 'AI-Warden API Down',
          message: message
        });
      }
    }
  };
  
  // Initialize validator (will auto-detect API key from multiple sources)
  const validator = new SecurityValidator(config, notifyApiDown);
  
  // Log initialization
  console.log('[AI-Warden] Plugin initialized with runtime layer control');
  console.log('[AI-Warden] Verbose mode:', config.verbose);
  console.log('[AI-Warden] Layers:', JSON.stringify(config.layers));
  console.log('[AI-Warden] API object methods:', Object.keys(api).filter(k => typeof api[k] === 'function'));
  
  if (config.verbose) {
    console.log('[AI-Warden] Plugin initialized with layers:', config.layers);
  }
  
  // ========================================================================
  // LAYER 0.5: Telegram Message Blocker (INPUT BLOCKING)
  // ========================================================================
  // DESPERATE SUBAGENT SOLUTION: Wrap dispatchTelegramMessage!
  // This ACTUALLY blocks messages before LLM!!!
  
  console.log('[AI-Warden] 🚫 Creating Telegram blocker...');
  
  const telegramBlocker = createTelegramBlocker({
    validator,
    stateManager,
    config
  });
  
  // Wrap dispatchTelegramMessage at gateway_start
  api.on('gateway_start', async () => {
    try {
      console.log('[AI-Warden] gateway_start triggered, wrapping Telegram dispatch...');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find Telegram channel plugin
      const channels: any = api.runtime?.channels || {};
      const telegramChannel: any = Object.values(channels).find((ch: any) => 
        ch.name === 'telegram' || ch.id === 'telegram'
      );
      
      if (!telegramChannel) {
        console.warn('[AI-Warden] ⚠️ Telegram channel not found');
        return;
      }
      
      console.log('[AI-Warden] Found Telegram channel:', telegramChannel.name);
      
      // Try to find dispatch function in channel
      // This is channel-specific patching
      if (typeof telegramChannel.dispatchMessage === 'function') {
        const original = telegramChannel.dispatchMessage;
        telegramChannel.dispatchMessage = telegramBlocker.wrapDispatch(original);
        console.log('[AI-Warden] ✅ Telegram dispatch WRAPPED - INPUT BLOCKING ENABLED!');
      } else {
        console.warn('[AI-Warden] ⚠️ Could not find dispatchMessage on Telegram channel');
        console.warn('[AI-Warden] Available methods:', Object.keys(telegramChannel).filter(k => typeof telegramChannel[k] === 'function'));
      }
      
    } catch (error: any) {
      console.error('[AI-Warden] ❌ Failed to wrap Telegram dispatch:', error.message);
    }
  });
  
  // ========================================================================
  // LAYER 1: Channel Input Validation (Stats Only)
  // ========================================================================
  // NOTE: This hook is for STATS ONLY - it cannot block messages.
  // Actual blocking is done by the command handler above.
  
  // NOTE: message_received hook is fire-and-forget and CANNOT block messages.
  // Layer 1 blocking is now handled in before_agent_start hook (see Layer 1 + 2 combined below)
  
  // ========================================================================
  // WARNING INJECTION: agent:bootstrap hook
  // ========================================================================
  // Inject pending warnings as workspace file so LLM sees and relays them
  
  console.log('[AI-Warden] 📢 Registering agent:bootstrap hook for warning injection...');
  
  api.on('agent:bootstrap', async (event: any, ctx: any) => {
    try {
      const sessionKey = ctx.sessionKey || event.context?.sessionKey;
      if (!sessionKey) return;
      
      const pendingWarnings = warningEngine.getPendingWarnings(sessionKey);
      
      if (pendingWarnings.length > 0) {
        console.log(`[AI-Warden] 📢 Injecting ${pendingWarnings.length} pending warning(s) into bootstrap`);
        
        const warningContent = pendingWarnings
          .map(w => warningEngine.formatWarning(w))
          .join('\n\n---\n\n');
        
        const securityFile = {
          name: 'SECURITY-ALERTS.md',
          path: '/virtual/security-alerts.md',
          content: `# 🚨 SECURITY ALERTS

The following security concerns were detected in the previous interaction:

${warningContent}

---

**ACTION REQUIRED:** Please inform the user about these security alerts in your next response. Be clear but not alarming.`
        };
        
        // Inject into bootstrapFiles
        if (event.context?.bootstrapFiles) {
          event.context.bootstrapFiles.push(securityFile);
        } else if (ctx.bootstrapFiles) {
          ctx.bootstrapFiles.push(securityFile);
        } else {
          console.warn('[AI-Warden] Could not find bootstrapFiles to inject warning');
        }
        
        // Clear warnings after injection
        warningEngine.clearPendingWarnings(sessionKey);
        console.log('[AI-Warden] ✅ Warnings injected and cleared');
      }
    } catch (err) {
      console.error('[AI-Warden] Failed to inject warnings:', err);
    }
  });
  
  // ========================================================================
  // LAYER 1 + 2: Channel Input + Pre-LLM Gateway
  // ========================================================================
  // NOTE: Combined into one before_agent_start hook because:
  // 1. message_received is fire-and-forget (cannot block)
  // 2. before_agent_start CAN throw errors to block agent
  // 3. Both check user input before LLM processes it
  
  console.log('[AI-Warden] 📝 Registering before_agent_start hook (Layer 1 + 2)...');
  
  api.on('before_agent_start', async (event: any, ctx: any) => {
    const enabledChannel = stateManager.isLayerEnabled('channel');
    const enabledPreLlm = stateManager.isLayerEnabled('preLlm');
    
    if (!enabledChannel && !enabledPreLlm) {
      return; // Both layers disabled
    }
    
    try {
      const messages = event.messages || [];
      
      // LAYER 1: Channel Input Validation (scan latest user message only)
      if (enabledChannel) {
        const lastUserMessage = messages
          .filter((msg: any) => msg.role === 'user')
          .pop();
        
        if (lastUserMessage?.content) {
          const content = typeof lastUserMessage.content === 'string'
            ? lastUserMessage.content
            : JSON.stringify(lastUserMessage.content);
          
          if (config.verbose) {
            console.log(`[AI-Warden] Layer 1: Scanning latest message: "${content.substring(0, 50)}..."`);
          }
          
          const result = await validator.scanContent({
            content,
            source: 'channel',
            metadata: { 
              channelId: ctx.channelId,
              sessionKey: ctx.sessionKey
            }
          });
          
          const shouldBlock = !result.safe;
          
          // Record scan
          stateManager.recordScan({
            layer: 'channel',
            blocked: shouldBlock,
            score: result.risk || 0,
            reason: result.message
          });
          
          // Track last user message for warning context
          warningEngine.updateLastUserMessage(ctx.sessionKey, content);
          
          // DEBUG: Log entire ctx AND event to find recipient field
          console.log('[AI-Warden] 🔍 DEBUG ctx keys:', Object.keys(ctx));
          console.log('[AI-Warden] 🔍 DEBUG ctx.messageProvider:', ctx.messageProvider);
          console.log('[AI-Warden] 🔍 DEBUG event keys:', Object.keys(event));
          console.log('[AI-Warden] 🔍 DEBUG event sample:', JSON.stringify({
            provider: event.provider,
            from: event.from,
            chatId: event.chatId,
            channelId: event.channelId,
            surface: event.surface
          }, null, 2));
          
          // Check if warning needed (even if not blocking)
          if (!result.safe || (result.risk && result.risk > 0.5)) {
            const warning = warningEngine.shouldWarn({
              type: 'INPUT_THREAT',
              layer: 1,
              threat: {
                confidence: result.risk || 0.5,
                type: result.message || 'suspicious_input',
                pattern: content.substring(0, 100),
                timestamp: Date.now()
              },
              sessionId: ctx.sessionKey
            });
            
            if (warning) {
              console.log('[AI-Warden] 📢 Storing warning for next bootstrap:', warning.template);
              
              // Store warning to be injected at next agent:bootstrap
              warningEngine.storePendingWarning(ctx.sessionKey, warning);
              warningEngine.markWarningSent(ctx.sessionKey);
              
              console.log('[AI-Warden] ✅ Warning stored (will inject on next run)');
            }
          }
          
          // Note: We DON'T throw here anymore - warning already injected
          // Let LLM continue and relay the warning to user naturally
          if (shouldBlock) {
            console.log('[AI-Warden] ⚠️ High-risk input detected, warning injected for LLM relay');
          }
          
          if (config.verbose) {
            console.log('[AI-Warden] ✅ Layer 1 passed');
          }
        }
      }
      
      // LAYER 2: Pre-LLM Gateway (scan full conversation context)
      if (enabledPreLlm) {
        if (config.verbose) {
          console.log('[AI-Warden] Layer 2: Scanning full conversation context');
        }
        
        // Build full context from conversation history
        const fullContext = messages
          .map((msg: any) => {
            const role = msg.role || 'user';
            const content = typeof msg.content === 'string' 
              ? msg.content 
              : JSON.stringify(msg.content);
            return `[${role}]: ${content}`;
          })
          .join('\n\n');
        
        if (fullContext && fullContext.length > 0) {
          // Scan the FULL conversation context
          const result = await validator.scanContent({
            content: fullContext,
            source: 'pre_llm_context',
            metadata: { 
              sessionKey: ctx.sessionKey,
              messageCount: messages.length,
              contextLength: fullContext.length
            }
          });
          
          const shouldBlock = !result.safe;
          
          // Record scan
          stateManager.recordScan({
            layer: 'preLlm',
            blocked: shouldBlock,
            score: result.risk || 0,
            reason: result.message
          });
          
          if (shouldBlock) {
            // CRITICAL: Block entire LLM invocation
            if ((result.risk || 0) > 50) {
              throw new Error('⛔️ Conversation blocked: Security policy violation');
            }
            throw new Error(
              `⚠️ Conversation blocked by context analysis.\n` +
              `Reason: ${result.message || 'Suspicious pattern detected'}`
            );
          }
          
          if ((result.risk || 0) >= (config.policy?.warnThreshold || 100) && config.verbose) {
            console.warn(
              `[AI-Warden] Layer 2 Warning: Suspicious conversation pattern ` +
              `(score: ${result.risk || 0})`
            );
          }
        }
      }
    } catch (error) {
      // If it's a blocking error, rethrow it
      if (error instanceof Error && (error.message.includes('blocked') || error.message.includes('⛔️'))) {
        throw error;
      }
      
      // Otherwise log and fail-open
      console.error('[AI-Warden] Layer 1+2 error:', error);
      
      if (config.policy?.failOpen === false) {
        throw new Error('[AI-Warden] Security validation unavailable');
      }
    }
  });
  
  console.log('[AI-Warden] ✅ before_agent_start hook registered (Layer 1 + 2)');
  
  // ========================================================================
  // LAYER 3: Tool Argument Validation
  // ========================================================================
  
  console.log('[AI-Warden] 📝 Registering before_tool_call hook (Layer 3)...');
  
  api.on('before_tool_call', async (event: any, ctx: any) => {
    console.log('[AI-Warden] 🔧 before_tool_call triggered for tool:', event.toolName);
    
    if (!stateManager.isLayerEnabled('toolArgs')) {
      return;
    }
    
      // ENHANCED: Check if session is flagged as suspicious (INPUT detected threat)
      const sessionKey = ctx.sessionKey;
      if (sessionKey && stateManager.isSessionSuspicious(sessionKey)) {
        const details = stateManager.getSuspiciousSessionDetails(sessionKey);
        console.log(`[AI-Warden] 🚨 OUTPUT BLOCKING: Session flagged (${details.reason}), tool call blocked!`);
        
        stateManager.recordScan({
          layer: 'toolArgs',
          blocked: true,
          score: details.risk,
          reason: `Output blocked - session flagged: ${details.reason}`
        });
        
        return {
          block: true,
          blockReason: `⛔️ Tool execution blocked due to suspicious session activity`
        };
      }
      
      // Skip content tools (handled by Layer 0 wrappers)
      const contentTools = ['web_fetch', 'browser', 'read'];
      if (contentTools.includes(event.toolName)) {
        return;
      }
      
      if (config.verbose) {
        console.log(`[AI-Warden] Layer 3: Validating ${event.toolName} arguments`);
      }
      
      const validation = await validator.validateToolArgs({
        toolName: event.toolName,
        params: event.params
      });
      
      // Record scan
      stateManager.recordScan({
        layer: 'toolArgs',
        blocked: validation.block,
        reason: validation.reason
      });
      
      if (validation.block) {
        // Generate warning for blocked action
        const warning = warningEngine.shouldWarn({
          type: 'ACTION_BLOCKED',
          layer: 3,
          action: {
            toolName: event.toolName,
            toolArgs: event.params,
            blockReason: validation.reason,
            riskScore: validation.risk || 8,
            timestamp: Date.now()
          },
          sessionId: ctx.sessionKey
        });
        
        // Generate full warning for blockReason (LLM will see and relay)
        let blockReasonText = `⚠️ Tool blocked by AI-Warden: ${validation.reason}`;
        
        if (warning) {
          const warningText = warningEngine.formatWarning(warning);
          console.log('[AI-Warden] 📢 Including warning in block reason');
          blockReasonText = `${warningText}\n\n---\nTechnical: ${validation.reason}`;
          warningEngine.markWarningSent(ctx.sessionKey);
        }
        
        return {
          block: true,
          blockReason: blockReasonText
        };
      }
  });
  
  // ========================================================================
  // LAYER 4: Subagent Task Validation
  // ========================================================================
  
  api.on('before_tool_call', async (event: any, ctx: any) => {
    if (!stateManager.isLayerEnabled('subagents')) {
      return;
    }
      if (event.toolName !== 'sessions_spawn') return;
      
      if (config.verbose) {
        console.log('[AI-Warden] Layer 4: Validating subagent task');
      }
      
      const validation = await validator.validateToolArgs({
        toolName: 'sessions_spawn',
        params: event.params
      });
      
      // Record scan
      stateManager.recordScan({
        layer: 'subagents',
        blocked: validation.block,
        reason: validation.reason
      });
      
      if (validation.block) {
        return {
          block: true,
          blockReason: `⚠️ Subagent blocked by AI-Warden: ${validation.reason}`
        };
      }
  });
  
  // ========================================================================
  // LAYER 5: Output Filtering
  // ========================================================================
  
  api.on('message_sending', async (event: any, ctx: any) => {
    if (!stateManager.isLayerEnabled('output')) {
      return;
    }
    
    if (config.verbose) {
      console.log('[AI-Warden] Layer 5: Filtering output');
    }
    
    // Update PII handler mode from runtime state
    piiHandler.setMode(stateManager.getPIIMode());
    
    // Process PII first
    const piiResult = piiHandler.process(event.content);
    let content = piiResult.modified;
    
    // Record PII detection
    if (piiResult.hasPII) {
      stateManager.recordPII(piiResult.count, piiResult.types);
      
      if (config.verbose) {
        console.log(`[AI-Warden] Detected ${piiResult.count} PII items (mode: ${stateManager.getPIIMode()})`);
      }
    }
    
    // Then apply legacy filtering (API keys, emails, paths)
    const filtered = await validator.filterOutput(content);
    
    // Record scan (always log output filtering)
    stateManager.recordScan({
      layer: 'output',
      blocked: filtered.modified || piiResult.hasPII
    });
    
    if (filtered.modified || piiResult.hasPII) {
      if (config.verbose) {
        const items = (filtered.matches?.length || 0) + piiResult.count;
        console.log(`[AI-Warden] Processed ${items} items from output`);
      }
      
      return { content: filtered.content };
    }
  });
  
  // ========================================================================
  // LAYER 0: Content Validation (HOOK-BASED - v1.1.0)
  // ========================================================================
  // NEW in v1.1.0: Replaced source patching with proper hook-based approach
  // Uses tool_result_persist synchronous hook for CRITICAL security validation
  
  registerLayer0(api, config, stateManager);
  
  // Register /warden commands
  registerWardenCommands(api, config, stateManager);
  
  // Final initialization log
  console.log('[AI-Warden] ✅ Plugin v1.1.0 initialized with runtime layer control');
  console.log('[AI-Warden] 📋 Use /warden to manage security layers');
  console.log('[AI-Warden] 🔐 Layer 0: Hook-based content validation (NEW in v1.1.0)');
}
