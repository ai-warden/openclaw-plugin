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
import type { SecurityConfig } from './types.js';

export default function aiWardenPlugin(api: any) {
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
          
          if (shouldBlock) {
            const blockMessage = (result.risk || 0) > 50
              ? '⛔️ Message blocked by security policy'
              : `⚠️ Message blocked: ${result.message || 'Security policy violation'}`;
            
            console.log('[AI-Warden] ⛔️ LAYER 1 BLOCKING MESSAGE:', blockMessage);
            throw new Error(blockMessage);
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
        return {
          block: true,
          blockReason: `⚠️ Tool blocked by AI-Warden: ${validation.reason}`
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
  // LAYER 0: Content Tool Wrappers (CRITICAL)
  // ========================================================================
  
  if (stateManager.isLayerEnabled('content')) {
    // We need to intercept tool creation to wrap web_fetch, browser, read
    // This is more complex and depends on OpenClaw's plugin API
    
    // Approach 1: If OpenClaw supports tool wrapping hooks
    api.on('tool_created', (event: any) => {
      if (event.toolName === 'web_fetch') {
        if (config.verbose) {
          console.log('[AI-Warden] Layer 0: Wrapping web_fetch with content scanner');
        }
        
        const secureWrapper = createSecureWebFetchWrapper(
          event.tool,
          validator,
          {
            blockThreshold: config.policy?.blockThreshold || 200,
            warnThreshold: config.policy?.warnThreshold || 100,
            logWarnings: config.verbose || false
          },
          (params) => stateManager.recordScan(params)
        );
        
        return { tool: secureWrapper };
      }
      
      // TODO: Add similar wrappers for 'browser' and 'read' tools
    });
    
    // Approach 2: If tool wrapping isn't supported, use after_tool_call
    // (Less secure - content already in LLM context, but better than nothing)
    api.on('after_tool_call', async (event: any, ctx: any) => {
      const contentTools = ['web_fetch', 'browser', 'read'];
      if (!contentTools.includes(event.toolName)) return;
      
      if (config.verbose) {
        console.log(`[AI-Warden] Layer 0 fallback: Scanning ${event.toolName} result`);
      }
      
      // Extract and scan content
      const content = extractContentFromResult(event.result);
      if (!content) return;
      
      const scanResult = await validator.scanContent({
        content,
        source: event.toolName,
        metadata: { toolCallId: event.toolCallId }
      });
      
      if (!scanResult.safe) {
        // Log critical alert - content already in context but we can alert
        console.error(
          `[AI-Warden] ⚠️ CRITICAL: Malicious content detected AFTER tool execution!`,
          `Tool: ${event.toolName}, Score: ${scanResult.risk || 0}, Reason: ${scanResult.message}`
        );
        
        // Could trigger additional actions here:
        // - Send alert to admin
        // - Kill the session
        // - Log to security dashboard
      }
    });
  }
  
  // Register /warden commands
  registerWardenCommands(api, config, stateManager);
  
  // Log initialization
  console.log('[AI-Warden] Plugin initialized with runtime layer control');
  console.log('[AI-Warden] Use /warden to manage security layers');
}

/**
 * Helper: Extract content from tool result
 */
function extractContentFromResult(result: any): string | null {
  if (!result?.details) return null;
  
  if (typeof result.details.text === 'string') {
    return result.details.text;
  }
  
  if (Array.isArray(result.content)) {
    const textBlocks = result.content.filter(
      (block: any) => block?.type === 'text' && typeof block.text === 'string'
    );
    return textBlocks.map((b: any) => b.text).join('\n');
  }
  
  return null;
}
