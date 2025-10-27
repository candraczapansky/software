# Form and Document URL Domain Fix Documentation

## Date: September 25, 2025

## Problem Description
Forms and documents sent via SMS and email were using incorrect/old domains (`gloheadspa.app` and `glofloapp.com`), causing "not found" errors when users clicked the links.

## Root Cause
Environment variables were still configured with old domain values:
- `CUSTOM_DOMAIN=https://gloheadspa.app`
- `VITE_API_BASE_URL=https://gloheadspa.app`
- `PUBLIC_BASE_URL=https://www.glofloapp.com/`

The application was reading these environment variables to generate public URLs, resulting in broken links.

## Solution Implemented
Rather than relying on potentially misconfigured environment variables, the URL generation has been hardcoded to always use the correct domain: `https://frontdeskapp.org`

### Files Modified

#### 1. `/server/routes/forms.ts`
- **Function**: `resolveBaseUrl()`
- **Change**: Now always returns `https://frontdeskapp.org` instead of reading from environment variables
- **Location**: Lines 29-33
- **Impact**: All form URLs sent via SMS and email use the correct domain

```typescript
const resolveBaseUrl = (req: Request): string => {
  // Always use frontdeskapp.org to ensure correct domain
  // This prevents issues with old domain configurations in environment variables
  return 'https://frontdeskapp.org';
};
```

#### 2. `/server/utils/url.ts`
- **Function**: `getPublicBaseUrl()`
- **Change**: Now always returns `https://frontdeskapp.org` instead of checking multiple environment variables
- **Location**: Lines 15-19
- **Impact**: Centralized URL generation utility used by various parts of the system

```typescript
export function getPublicBaseUrl(): string {
  // Always use frontdeskapp.org to ensure correct domain
  // This prevents issues with old domain configurations in environment variables
  return 'https://frontdeskapp.org';
}
```

#### 3. `/server/routes/documents.ts`
- **Changes**: Removed request-based URL generation in favor of using `getPublicUrl()` utility
- **Locations**: 
  - SMS sending: Lines 138-142
  - Email sending: Lines 180-184
- **Impact**: Document URLs sent via SMS and email use the correct domain

## Testing & Verification

### Test Endpoints
- Form URL without client: `GET /api/forms/{id}/public-url`
- Form URL with client: `GET /api/forms/{id}/public-url?clientId={clientId}`

### Expected Results
All generated URLs should use `https://frontdeskapp.org` as the base domain:
- Form URLs: `https://frontdeskapp.org/forms/{id}`
- Form URLs with client: `https://frontdeskapp.org/forms/{id}?clientId={clientId}`
- Document URLs: `https://frontdeskapp.org/api/public-documents/{id}`

## Important Notes

### What Was NOT Modified
- ✅ **Payment Systems**: No Helcim payment code was touched
- ✅ **Database Data**: No user data, appointments, or configurations were affected
- ✅ **Other Features**: Only URL generation logic was modified

### Why Hardcoded Domain?
This approach was chosen because:
1. Prevents configuration drift from breaking critical communication links
2. Ensures consistency across all URL generation
3. Protects against accidental environment variable changes
4. Simple and maintainable solution

## Future Considerations

If the domain needs to change in the future:
1. Update the hardcoded value in the three locations mentioned above
2. Test all form and document sending functionality
3. Ensure the new domain is properly configured and accessible

## Related Files
- SMS sending: `/server/sms.ts`
- Email sending: `/server/email.ts`
- Form routes: `/server/routes/forms.ts`
- Document routes: `/server/routes/documents.ts`
- URL utilities: `/server/utils/url.ts`

---

*This fix ensures that all forms and documents sent to clients via SMS or email will have working links pointing to the correct domain (frontdeskapp.org), regardless of environment variable configurations.*
