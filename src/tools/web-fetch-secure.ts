/**
 * Secure web_fetch wrapper - Layer 0 implementation
 * Scans fetched content before returning to LLM
 */

import type { SecurityValidator } from '../validator.js';

/**
 * Creates a secure wrapper around OpenClaw's web_fetch tool
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
  },
  recordScan?: (params: { layer: string; blocked: boolean; score?: number; reason?: string }) => void
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
      
      // Record scan
      if (recordScan) {
        recordScan({
          layer: 'content',
          blocked: !scanResult.safe,
          score: scanResult.risk || 0,
          reason: scanResult.message
        });
      }
      
      // Decision logic
      if (!scanResult.safe) {
        // BLOCK: Content is malicious
        return createBlockedResult({
          url: result.details?.finalUrl || url,
          reason: scanResult.message || 'Content contains malicious patterns',
          score: scanResult.risk || 0,
          threatType: scanResult.threatType
        });
      }
      
      if ((scanResult.risk || 0) >= config.warnThreshold && config.logWarnings) {
        // WARN: Content is suspicious but not blocked
        console.warn(
          `[AI-Warden] Suspicious content detected (score: ${scanResult.risk || 0}): ${url}`
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
      return textBlocks.map((b: { type: 'text'; text: string }) => b.text).join('\n');
    }
  }
  
  return null;
}

/**
 * Create a blocked result that prevents malicious content from reaching LLM
 * 
 * Strategy: Inform LLM that content was blocked, but minimize attack details
 * to prevent LLM from learning attack patterns.
 */
function createBlockedResult(params: {
  url: string;
  reason: string;
  score: number;
  threatType?: string;
}): any {
  const { url, reason, score, threatType } = params;
  
  // For HIGH severity (>500): Minimal info
  if (score > 500) {
    return {
      content: [{
        type: 'text',
        text: [
          `⚠️ **Content Security Block**`,
          ``,
          `The requested URL could not be retrieved due to security policies.`,
          ``,
          `URL: ${url}`,
          `Status: Blocked by content filter`
        ].join('\n')
      }],
      details: {
        blocked: true,
        url,
        score,
        finalUrl: url,
        status: 403,
        contentType: 'text/plain'
      }
    };
  }
  
  // For MEDIUM severity (200-500): More detail for transparency
  return {
    content: [{
      type: 'text',
      text: [
        `⚠️ **Security Alert: Content Blocked**`,
        ``,
        `URL: ${url}`,
        `Reason: ${reason}`,
        threatType ? `Category: ${threatType}` : '',
        ``,
        `The requested content has been blocked by AI-Warden security filters.`,
        `This typically indicates potentially harmful content such as prompt injection attempts.`
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
