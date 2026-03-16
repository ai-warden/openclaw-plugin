/**
 * AI-Warden Layer 0: Content Validation (Hook-Based)
 * 
 * CRITICAL SECURITY LAYER - Intercepts tool results BEFORE they reach the LLM
 * 
 * This layer uses the `tool_result_persist` SYNCHRONOUS hook to validate
 * content from external sources (web_fetch, browser, read) for malicious patterns.
 * 
 * IMPLEMENTATION NOTE (2026.3.13):
 * - Replaced source patching with proper hook-based approach
 * - Uses synchronous hook (no async API calls allowed)
 * - Pattern matching must be fast and local
 * - Pre-cached threat patterns loaded at startup
 * 
 * @see https://github.com/ai-warden/openclaw-plugin
 * @version 1.1.0
 */

/**
 * Evil patterns for prompt injection and malicious content detection
 * These patterns are checked SYNCHRONOUSLY in the hook handler
 */
const EVIL_PATTERNS = [
  // Prompt injection patterns
  /ignore\s+(all\s+)?previous\s+(instructions?|directives?|prompts?)/i,
  /disregard\s+(all\s+)?previous\s+(instructions?|directives?|prompts?)/i,
  /forget\s+(all\s+)?previous\s+(instructions?|directives?|prompts?)/i,
  /override\s+(all\s+)?previous\s+(instructions?|directives?|prompts?)/i,
  
  // System role hijacking
  /system:\s*new\s+(instructions?|directives?|prompts?)/i,
  /assume\s+role\s*(of|as)\s*system/i,
  /you\s+are\s+now\s+(a|an)\s+system/i,
  
  // Script injection
  /<script[^>]*>/i,
  /<\/script>/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  
  // Code execution attempts
  /eval\s*\(/i,
  /exec\s*\(/i,
  /Function\s*\(/i,
  
  // Data exfiltration patterns
  /document\.cookie/i,
  /localStorage\./i,
  /sessionStorage\./i,
  
  // Common attack keywords
  /prompt\s*injection/i,
  /jailbreak/i,
  /bypass\s+filter/i,
  
  // SQL injection patterns (if LLM has DB access)
  /'\s*OR\s+'1'\s*=\s*'1/i,
  /;\s*DROP\s+TABLE/i,
  /UNION\s+SELECT/i,
  
  // Command injection
  /;\s*rm\s+-rf/i,
  /\|\s*bash/i,
  /&&\s*curl/i,
  
  // Sensitive data patterns (extra paranoid)
  /BEGIN\s+PRIVATE\s+KEY/i,
  /BEGIN\s+RSA\s+PRIVATE\s+KEY/i,
  /api[_-]?key\s*[:=]/i,
  /secret[_-]?key\s*[:=]/i,
  /password\s*[:=]/i
];

/**
 * Extract text content from various message formats
 */
function extractTextFromMessage(message: any): string {
  // Handle string messages
  if (typeof message === 'string') {
    return message;
  }
  
  // Handle structured message with content array
  if (message?.content && Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('\n');
  }
  
  // Handle message with direct text field
  if (message?.text && typeof message.text === 'string') {
    return message.text;
  }
  
  // Handle tool result format
  if (message?.result && typeof message.result === 'string') {
    return message.result;
  }
  
  // Handle details.text format (common in tool results)
  if (message?.details?.text && typeof message.details.text === 'string') {
    return message.details.text;
  }
  
  // Last resort: stringify entire object
  return JSON.stringify(message);
}

/**
 * Check if content matches any evil patterns
 * Returns the matched pattern or null if safe
 */
function findEvilPattern(text: string): RegExp | null {
  for (const pattern of EVIL_PATTERNS) {
    if (pattern.test(text)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Register Layer 0 content validation hook
 * 
 * @param api - Moltbot plugin API
 * @param config - Security configuration
 * @param stateManager - State manager for stats tracking
 */
export function registerLayer0(api: any, config: any, stateManager: any) {
  if (!config.layers?.content) {
    console.log('[AI-Warden] Layer 0 (content) disabled by config');
    return;
  }
  
  console.log('[AI-Warden] 📝 Registering tool_result_persist hook (Layer 0 - Hook-Based)...');
  
  api.on('tool_result_persist', (event: any, ctx: any) => {
    try {
      // Extract tool name and result message
      const toolName = event.toolName || 'unknown';
      const message = event.message;
      
      // Only check content tools
      const contentTools = ['web_fetch', 'browser', 'read', 'web_search'];
      if (!contentTools.includes(toolName)) {
        return undefined; // Pass through non-content tools
      }
      
      // Extract text from message
      const text = extractTextFromMessage(message);
      
      if (!text || text.length === 0) {
        return undefined; // No text to check
      }
      
      if (config.verbose) {
        console.log(`[AI-Warden] Layer 0: Scanning ${toolName} result (${text.length} chars)`);
      }
      
      // Check for evil patterns
      const matchedPattern = findEvilPattern(text);
      
      if (matchedPattern) {
        // CRITICAL: Malicious content detected!
        console.error(
          `[AI-Warden] 🚨 Layer 0 BLOCKED ${toolName}: Pattern matched - ${matchedPattern.source}`
        );
        
        // Record blocking event
        stateManager.recordScan({
          layer: 'content',
          blocked: true,
          score: 999, // Maximum risk score
          reason: `Malicious pattern detected: ${matchedPattern.source.substring(0, 50)}...`
        });
        
        // Return modified message with security block
        return {
          message: {
            content: [{
              type: 'text',
              text: `⛔ SECURITY BLOCK: Malicious content detected in ${toolName} result.\n\n` +
                    `AI-Warden Layer 0 has blocked potentially harmful content that attempted ` +
                    `to manipulate the AI system through prompt injection or code execution.\n\n` +
                    `Pattern matched: ${matchedPattern.source.substring(0, 100)}\n\n` +
                    `This is a security measure to protect against indirect attacks via external ` +
                    `content sources. If you believe this is a false positive, please contact ` +
                    `your system administrator.`
            }]
          }
        };
      }
      
      // Content is safe - pass through unchanged
      if (config.verbose) {
        console.log(`[AI-Warden] ✅ Layer 0: ${toolName} result passed validation`);
      }
      
      // Record successful scan
      stateManager.recordScan({
        layer: 'content',
        blocked: false,
        score: 0,
        reason: 'Pattern matching passed'
      });
      
      return undefined; // Pass through (no modification)
      
    } catch (error: any) {
      // Critical error in Layer 0 - fail safely
      console.error('[AI-Warden] ❌ Layer 0 error:', error.message);
      
      // Record error
      stateManager.recordScan({
        layer: 'content',
        blocked: false,
        score: -1,
        reason: `Error: ${error.message}`
      });
      
      // Fail-open behavior (configurable)
      if (config.policy?.failOpen === false) {
        // Fail-closed: block on error
        return {
          message: {
            content: [{
              type: 'text',
              text: '⛔ SECURITY ERROR: Content validation failed. Request blocked for safety.'
            }]
          }
        };
      }
      
      // Fail-open: allow content but log error
      return undefined;
    }
  });
  
  console.log('[AI-Warden] ✅ tool_result_persist hook registered (Layer 0)');
  console.log(`[AI-Warden] Layer 0 monitoring: ${EVIL_PATTERNS.length} malicious patterns loaded`);
}
