/**
 * Secure web_fetch wrapper - Layer 0 implementation
 * Scans fetched content before returning to LLM
 */

import type { SecurityValidator } from '../validator.js';

/**
 * Creates a secure wrapper around Moltbot's web_fetch tool
 * This is needed because hooks run AFTER tool execution, but we need
 * to scan content BEFORE it enters the LLM context
 */
export function createSecureWebFetchWrapper(
  baseTool: any,
  validator: SecurityValidator,
  config: {
    blockThreshold: number;
    warnThreshold: number;
    logWarnings: boolean;
  }
) {
  if (!baseTool) return null;
  
  return {
    ...baseTool,
    name: 'web_fetch',
    description: baseTool.description + ' (Security: AI-Warden content scanning enabled)',
    
    execute: async (toolCallId: string, args: any, signal?: AbortSignal, onUpdate?: Function) => {
      const url = String(args?.url || '');
      
      // Execute the base web_fetch tool
      const result = await baseTool.execute(toolCallId, args, signal, onUpdate);
      
      // Extract text content from result
      const content = extractTextContent(result);
      if (!content) {
        // No text content to scan, pass through
        return result;
      }
      
      // Scan the fetched content
      const scanResult = await validator.scanContent({
        content,
        source: 'web_fetch',
        metadata: {
          url,
          finalUrl: result.details?.finalUrl || url,
          contentType: result.details?.contentType,
          contentLength: content.length
        }
      });
      
      // Decision logic
      if (scanResult.score >= config.blockThreshold) {
        // BLOCK: Content is malicious
        return createBlockedResult({
          url: result.details?.finalUrl || url,
          reason: scanResult.reason || 'Content contains malicious patterns',
          score: scanResult.score,
          threatType: scanResult.threatType
        });
      }
      
      if (scanResult.score >= config.warnThreshold && config.logWarnings) {
        // WARN: Content is suspicious but not blocked
        console.warn(
          `[AI-Warden] Suspicious content detected (score: ${scanResult.score}): ${url}`
        );
      }
      
      // Pass through if safe
      return result;
    }
  };
}

/**
 * Extract text content from tool result
 */
function extractTextContent(result: any): string | null {
  if (!result?.details || typeof result.details !== 'object') {
    return null;
  }
  
  const details = result.details as Record<string, unknown>;
  
  // Check for text field in details
  if (typeof details.text === 'string') {
    return details.text;
  }
  
  // Fallback: extract from content blocks
  if (Array.isArray(result.content)) {
    const textBlocks = result.content.filter(
      (block: any): block is { type: 'text'; text: string } =>
        block?.type === 'text' && typeof block.text === 'string'
    );
    
    if (textBlocks.length > 0) {
      return textBlocks.map(b => b.text).join('\n');
    }
  }
  
  return null;
}

/**
 * Create a blocked result that prevents malicious content from reaching LLM
 */
function createBlockedResult(params: {
  url: string;
  reason: string;
  score: number;
  threatType?: string;
}): any {
  const { url, reason, score, threatType } = params;
  
  return {
    content: [{
      type: 'text',
      text: [
        `⚠️ **Security Alert: Content Blocked**`,
        ``,
        `URL: ${url}`,
        `Reason: ${reason}`,
        `Threat Score: ${score}/1000`,
        threatType ? `Threat Type: ${threatType}` : '',
        ``,
        `The requested URL has been blocked by AI-Warden content security filters.`,
        `This typically indicates prompt injection, malware, or other malicious content.`
      ].filter(Boolean).join('\n')
    }],
    details: {
      blocked: true,
      url,
      reason,
      score,
      threatType,
      finalUrl: url,
      status: 403,
      contentType: 'text/plain'
    }
  };
}
