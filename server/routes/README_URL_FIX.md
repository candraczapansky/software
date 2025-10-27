# 📌 Quick Reference: URL Domain Fix

## ⚠️ Important: Form & Document URLs

All public URLs for forms and documents are **hardcoded** to use `https://frontdeskapp.org` to prevent broken links.

### Why?
Previously, environment variables contained old domains (`gloheadspa.app`, `glofloapp.com`) causing "not found" errors when users clicked links in SMS/email messages.

### Where?

| File | Function | Purpose |
|------|----------|---------|
| `forms.ts` | `resolveBaseUrl()` | Form URLs for SMS/email |
| `documents.ts` | SMS/Email handlers | Document URLs |
| `../utils/url.ts` | `getPublicBaseUrl()` | Central URL utility |

### If Domain Changes
Update the hardcoded domain in all three locations above.

### Full Documentation
See `/server/FORM_URL_DOMAIN_FIX.md` for complete details.

---
*Last updated: September 25, 2025*
