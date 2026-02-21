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
import type { SecurityConfig } from './types.js';

export default function aiWardenPlugin(api: any) {
  const config = api.pluginConfig as SecurityConfig;
  
  // Initialize validator (will auto-detect API key from multiple sources)
  const validator = new SecurityValidator(config);
  
  // Log initialization
  if (config.verbose) {
    console.log('[AI-Warden] Plugin initialized with layers:', config.layers);
  }
  
  // ========================================================================
  // LAYER 1: Channel Input Validation
  // ========================================================================
  
  if (config.layers.channel) {
    api.on('message_received', async (event: any, ctx: any) => {
      if (config.verbose) {
        console.log(`[AI-Warden] Layer 1: Scanning message from ${ctx.channelId}`);
      }
      
      const result = await validator.scanContent({
        content: event.content,
        source: 'channel',
        metadata: { channelId: ctx.channelId, userId: ctx.userId }
      });
      
      if (result.blocked) {
        throw new Error(`⚠️ Message blocked by AI-Warden: ${result.reason} (score: ${result.score})`);
      }
    });
  }
  
  // ========================================================================
  // LAYER 2: Pre-LLM Gateway (Context Analysis)
  // ========================================================================
  
  if (config.layers.preLlm) {
    api.on('before_agent_start', async (event: any, ctx: any) => {
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
      
      if (result.blocked) {
        // CRITICAL: Block entire LLM invocation
        throw new Error(
          `⚠️ Conversation blocked by AI-Warden context analysis:\n` +
          `${result.reason} (score: ${result.score})\n\n` +
          `This can happen when multiple safe messages combine into a malicious pattern.\n` +
          `Session may need to be reset.`
        );
      }
      
      if (result.score >= (config.policy?.warnThreshold || 100) && config.verbose) {
        console.warn(
          `[AI-Warden] Layer 2 Warning: Suspicious conversation pattern detected ` +
          `(score: ${result.score}). Not blocking yet, but monitoring.`
        );
      }
    });
  }
  
  // ========================================================================
  // LAYER 3: Tool Argument Validation
  // ========================================================================
  
  if (config.layers.toolArgs) {
    api.on('before_tool_call', async (event: any, ctx: any) => {
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
      
      if (validation.block) {
        return {
          block: true,
          blockReason: `⚠️ Tool blocked by AI-Warden: ${validation.reason}`
        };
      }
    });
  }
  
  // ========================================================================
  // LAYER 4: Subagent Task Validation
  // ========================================================================
  
  if (config.layers.subagents) {
    api.on('before_tool_call', async (event: any, ctx: any) => {
      if (event.toolName !== 'sessions_spawn') return;
      
      if (config.verbose) {
        console.log('[AI-Warden] Layer 4: Validating subagent task');
      }
      
      const validation = await validator.validateToolArgs({
        toolName: 'sessions_spawn',
        params: event.params
      });
      
      if (validation.block) {
        return {
          block: true,
          blockReason: `⚠️ Subagent blocked by AI-Warden: ${validation.reason}`
        };
      }
    });
  }
  
  // ========================================================================
  // LAYER 5: Output Filtering
  // ========================================================================
  
  if (config.layers.output) {
    api.on('message_sending', async (event: any, ctx: any) => {
      if (config.verbose) {
        console.log('[AI-Warden] Layer 5: Filtering output');
      }
      
      const filtered = await validator.filterOutput(event.content);
      
      if (filtered.modified) {
        if (config.verbose) {
          console.log(`[AI-Warden] Redacted ${filtered.matches?.length || 0} items from output`);
        }
        
        return { content: filtered.content };
      }
    });
  }
  
  // ========================================================================
  // LAYER 0: Content Tool Wrappers (CRITICAL)
  // ========================================================================
  
  if (config.layers.content) {
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
          }
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
      
      if (scanResult.blocked) {
        // Log critical alert - content already in context but we can alert
        console.error(
          `[AI-Warden] ⚠️ CRITICAL: Malicious content detected AFTER tool execution!`,
          `Tool: ${event.toolName}, Score: ${scanResult.score}, Reason: ${scanResult.reason}`
        );
        
        // Could trigger additional actions here:
        // - Send alert to admin
        // - Kill the session
        // - Log to security dashboard
      }
    });
  }
  
  // Register /security command
  api.registerCommand?.({
    name: 'security',
    description: 'View AI-Warden security statistics',
    handler: async () => {
      return {
        text: [
          '🛡️ **AI-Warden Security Status**',
          '',
          '**Enabled Layers:**',
          config.layers.content ? '✅ Layer 0: Content Validation (CRITICAL)' : '❌ Layer 0: Disabled',
          config.layers.channel ? '✅ Layer 1: Channel Input' : '❌ Layer 1: Disabled',
          config.layers.preLlm ? '✅ Layer 2: Pre-LLM Context Analysis' : '⚠️  Layer 2: Disabled (enable for concatenated attack protection)',
          config.layers.toolArgs ? '✅ Layer 3: Tool Arguments' : '❌ Layer 3: Disabled',
          config.layers.subagents ? '✅ Layer 4: Subagent Tasks' : '❌ Layer 4: Disabled',
          config.layers.output ? '✅ Layer 5: Output Filtering' : '❌ Layer 5: Disabled',
          '',
          '**Policy:**',
          `Block Threshold: ${config.policy?.blockThreshold || 200}`,
          `Warn Threshold: ${config.policy?.warnThreshold || 100}`,
          `Cache TTL: ${config.policy?.cacheSeconds || 300}s`,
          '',
          'Powered by AI-Warden | https://prompt-shield.se'
        ].join('\n')
      };
    }
  });
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
