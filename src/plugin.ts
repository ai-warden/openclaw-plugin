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
  // LAYER 1: Channel Input Validation
  // ========================================================================
  
  console.log('[AI-Warden] 📝 Registering message_received hook...');
  
  api.on('message_received', async (event: any, ctx: any) => {
    console.log('[AI-Warden] 🔔 message_received event triggered!');
    console.log('[AI-Warden] Event object:', JSON.stringify(event, null, 2));
    console.log('[AI-Warden] Context object:', JSON.stringify(ctx, null, 2));
    
    try {
      // DEFENSIVE: Check event exists
      if (!event) {
        console.error('[AI-Warden] ❌ event is null/undefined!');
        return;
      }
      
      // DEFENSIVE: Check content exists
      if (!event.content || typeof event.content !== 'string') {
        console.log('[AI-Warden] ⚠️ No content to scan (content is null, undefined, or not a string)');
        return;
      }
      
      console.log('[AI-Warden] Content preview:', event.content.substring(0, 50));
      
      // DEFENSIVE: Check ctx exists
      if (!ctx) {
        console.error('[AI-Warden] ❌ ctx is null/undefined!');
        return;
      }
      
      // Check if layer is enabled (runtime toggle)
      console.log('[AI-Warden] Checking if layer is enabled...');
      const layerEnabled = stateManager.isLayerEnabled('channel');
      console.log('[AI-Warden] Layer enabled:', layerEnabled);
      
      if (!layerEnabled) {
        console.log('[AI-Warden] Layer 1 (channel) is DISABLED, skipping scan');
        return; // Layer disabled, skip scan
      }
      
      console.log('[AI-Warden] ✅ All checks passed, starting scan...');
      console.log(`[AI-Warden] Layer 1: Scanning message from ${ctx.channelId}: "${event.content.substring(0, 50)}..."`);
      
      // Add timeout to prevent hanging
      const scanPromise = validator.scanContent({
        content: event.content,
        source: 'channel',
        metadata: { channelId: ctx.channelId, userId: ctx.userId }
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Scan timeout after 10s')), 10000);
      });
      
      console.log('[AI-Warden] Calling validator.scanContent...');
      const result = await Promise.race([scanPromise, timeoutPromise]);
      console.log('[AI-Warden] ✅ Scan completed!');
      console.log('[AI-Warden] Result:', JSON.stringify(result, null, 2));
    
      // AI-Warden returns: safe (boolean), risk (0-100)
      // safe: false = attack detected by AI-Warden's logic
      const shouldBlock = !result.safe;
      
      console.log(`[AI-Warden] Layer 1 result: safe=${result.safe}, risk=${result.risk}, shouldBlock=${shouldBlock}`);
      
      // Record scan
      console.log('[AI-Warden] Recording scan result...');
      stateManager.recordScan({
        layer: 'channel',
        blocked: shouldBlock,
        score: result.risk || 0,
        reason: result.message
      });
      console.log('[AI-Warden] ✅ Scan recorded');
      
      if (shouldBlock) {
        const blockMessage = (result.risk || 0) > 50
          ? '[AI-Warden] Message blocked by security policy'
          : `⚠️ Message blocked: ${result.message || 'Security policy violation'}`;
        
        console.log('[AI-Warden] ⛔️ BLOCKING MESSAGE:', blockMessage);
        
        // Try return first (if hook supports it)
        return {
          block: true,
          blockReason: blockMessage
        };
      }
      
      console.log('[AI-Warden] ✅ Message passed validation');
    } catch (error) {
      console.error('[AI-Warden] ❌ Layer 1 handler error:', error);
      console.error('[AI-Warden] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Don't rethrow - let message through on error (fail-open)
      console.log('[AI-Warden] Allowing message through (fail-open on error)');
    }
  });
  
  console.log('[AI-Warden] ✅ message_received hook registered');
  
  // ========================================================================
  // LAYER 2: Pre-LLM Gateway (Context Analysis)
  // ========================================================================
  
  api.on('before_agent_start', async (event: any, ctx: any) => {
    if (!stateManager.isLayerEnabled('preLlm')) {
      return; // Layer disabled
    }
      if (config.verbose) {
        console.log('[AI-Warden] Layer 2: Scanning full conversation context');
      }
      
      // Build full context from conversation history
      const messages = event.messages || [];
      const fullContext = messages
        .map((msg: any) => {
          const role = msg.role || 'user';
          const content = typeof msg.content === 'string' 
            ? msg.content 
            : JSON.stringify(msg.content);
          return `[${role}]: ${content}`;
        })
        .join('\n\n');
      
      if (!fullContext || fullContext.length === 0) {
        return; // No context to scan
      }
      
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
      
      // AI-Warden returns: safe (boolean), risk (0-100)
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
        // HIGH severity: Minimal info (prevent attack learning)
        if ((result.risk || 0) > 50) {
          throw new Error('[AI-Warden] Conversation blocked: Security policy violation');
        }
        // MEDIUM: More context for legitimate debugging
        throw new Error(
          `⚠️ Conversation blocked by context analysis.\n` +
          `Reason: ${result.message || 'Suspicious pattern detected'}\n\n` +
          `Note: Multiple messages may have combined into a potentially malicious pattern.`
        );
      }
      
      if ((result.risk || 0) >= (config.policy?.warnThreshold || 100) && config.verbose) {
        console.warn(
          `[AI-Warden] Layer 2 Warning: Suspicious conversation pattern detected ` +
          `(score: ${result.risk || 0}). Not blocking yet, but monitoring.`
        );
      }
  });
  
  // ========================================================================
  // LAYER 3: Tool Argument Validation
  // ========================================================================
  
  console.log('[AI-Warden] 📝 Registering before_tool_call hook (Layer 3)...');
  
  api.on('before_tool_call', async (event: any, ctx: any) => {
    console.log('[AI-Warden] 🔧 before_tool_call triggered for tool:', event.toolName);
    
    if (!stateManager.isLayerEnabled('toolArgs')) {
      return;
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
