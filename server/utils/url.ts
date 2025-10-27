/**
 * URL utilities for generating public-facing URLs
 * 
 * IMPORTANT: Domain is hardcoded to prevent broken links from misconfigured environment variables.
 * See /server/FORM_URL_DOMAIN_FIX.md for details about this fix.
 */

/**
 * Get the public base URL for the application
 * 
 * ⚠️ HARDCODED DOMAIN FIX (Sept 25, 2025)
 * This function previously read from environment variables which contained old domains
 * (gloheadspa.app, glofloapp.com) causing broken links in SMS/email messages.
 * 
 * Now hardcoded to always return the correct domain to ensure reliability.
 * If domain needs to change, update here and in:
 * - /server/routes/forms.ts (resolveBaseUrl function)
 * - /server/routes/documents.ts (URL generation sections)
 * 
 * Original priority order was:
 * 1. FRONTEND_URL environment variable
 * 2. CUSTOM_DOMAIN environment variable  
 * 3. PUBLIC_BASE_URL environment variable
 * 4. VITE_API_BASE_URL environment variable
 * 5. Replit domain (REPLIT_DOMAINS)
 * 6. Default: https://frontdeskapp.org
 */
export function getPublicBaseUrl(): string {
  // Always use frontdeskapp.org to ensure correct domain
  // This prevents issues with old domain configurations in environment variables
  return 'https://frontdeskapp.org';
}

/**
 * Generate a public URL for a form
 * @param formId - The form ID
 * @param clientId - Optional client ID to include in the URL
 * @returns The complete public URL for the form
 */
export function getFormPublicUrl(formId: number | string, clientId?: number | string): string {
  const baseUrl = getPublicBaseUrl();
  const formUrl = clientId 
    ? `${baseUrl}/forms/${formId}?clientId=${clientId}` 
    : `${baseUrl}/forms/${formId}`;
  
  return formUrl;
}

/**
 * Generate a public URL for any path
 * @param path - The path (without leading slash)
 * @returns The complete public URL
 */
export function getPublicUrl(path: string): string {
  const baseUrl = getPublicBaseUrl();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}/${cleanPath}`;
}

/**
 * Debug function to log current URL configuration
 */
export function debugUrlConfig(): void {
  console.log('[URL DEBUG] Environment variables:');
  console.log(`  FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);
  console.log(`  CUSTOM_DOMAIN: ${process.env.CUSTOM_DOMAIN || 'not set'}`);
  console.log(`  PUBLIC_BASE_URL: ${process.env.PUBLIC_BASE_URL || 'not set'}`);
  console.log(`  VITE_API_BASE_URL: ${process.env.VITE_API_BASE_URL || 'not set'}`);
  console.log(`  REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS || 'not set'}`);
  console.log(`  REPL_ID: ${process.env.REPL_ID || 'not set'}`);
  console.log(`  REPL_OWNER: ${process.env.REPL_OWNER || 'not set'}`);
  console.log(`  REPL_SLUG: ${process.env.REPL_SLUG || 'not set'}`);
  console.log(`[URL DEBUG] Generated base URL: ${getPublicBaseUrl()}`);
} 