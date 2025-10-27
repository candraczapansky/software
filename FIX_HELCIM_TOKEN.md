# Fixing Helcim API Token Issue

## The Problem
Your Helcim API token in `.env` is invalid, causing a 401 Unauthorized error.

## How to Get Your Correct Helcim API Token

1. **Log in to your Helcim account**
   - Go to https://app.helcim.com/
   - Sign in with your credentials

2. **Navigate to API Tokens**
   - Click on your account name (top right)
   - Go to "Settings" → "API Access" or "Integrations" → "API Tokens"

3. **Create or Copy an API Token**
   - If you have an existing token, copy it
   - If not, create a new API token with these permissions:
     - Process Payments
     - View Transactions
     - Manage Customers
     - Process Card Verifications

4. **Your Helcim API token should look like**:
   ```
   adClJoT.dK7VjH9k8mN3pQ2rS5tU1vW4xY6zB0cD
   ```
   (Format: alphanumeric characters with periods)

## Update Your .env File

1. Open your `.env` file
2. Replace the current invalid token with your actual Helcim API token:

```bash
# Correct format
HELCIM_API_TOKEN=your_actual_helcim_api_token_here
HELCIM_ACCOUNT_ID=your_helcim_account_id
VITE_HELCIM_ACCOUNT_ID=your_helcim_account_id
```

## Example (DO NOT USE - Get your own from Helcim):
```bash
HELCIM_API_TOKEN=adClJoT.dK7VjH9k8mN3pQ2rS5tU1vW4xY6zB0cD
HELCIM_ACCOUNT_ID=2500189508
VITE_HELCIM_ACCOUNT_ID=2500189508
```

## After Updating

1. Restart your backend server:
```bash
# Kill the current server
pkill -f tsx

# Restart
npm run dev
```

2. Test the API directly:
```bash
curl -X POST http://localhost:3002/api/payments/helcim/initialize \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "description": "Test"}'
```

You should get a response with `checkoutToken` if the token is valid.

## Important Notes
- Helcim API tokens do NOT start with `sk-` 
- They are typically 40+ characters with periods
- Make sure you're using a PRODUCTION token if processing real payments
- The token needs proper permissions for payment processing
