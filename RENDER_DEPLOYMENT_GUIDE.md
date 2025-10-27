# Render Deployment Guide for DevBooking

This guide will help you deploy your booking application to Render.

## Prerequisites

1. A [Render account](https://render.com) (free tier available)
2. Your code pushed to a GitHub repository
3. API keys for the services you want to use (Twilio, SendGrid, etc.)

## Step 1: Prepare Your Repository

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Ensure these files are in your repository:**
   - `render.yaml` (already created)
   - `package.json` with proper build scripts
   - All source code

## Step 2: Connect to Render

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Blueprint"
3. Connect your GitHub account if not already connected
4. Select your repository
5. Render will automatically detect the `render.yaml` file

## Step 3: Configure Environment Variables

In the Render dashboard, set these environment variables:

### Required Variables:
- `JWT_SECRET`: Generate a secure random string (32+ characters)
- `APP_ENCRYPTION_KEY`: Generate another secure random string
- `ADMIN_PASSWORD`: Set a strong admin password

### Optional Service Variables:
Only add these if you're using the services:

**Twilio (SMS):**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

**SendGrid (Email):**
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SENDGRID_FROM_NAME`

**OpenAI (AI Features):**
- `OPENAI_API_KEY`

**Helcim (Payments):**
- `HELCIM_API_TOKEN`
- `HELCIM_WEBHOOK_VERIFIER_TOKEN`
- `VITE_HELCIM_ACCOUNT_ID`
- `VITE_HELCIM_TERMINAL_ID`
- `VITE_HELCIM_JS_TOKEN`

**AWS S3 (File Uploads):**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`

## Step 4: Deploy

1. Click "Apply" in the Render dashboard
2. Render will:
   - Create a PostgreSQL database
   - Build and deploy your backend API
   - Build and deploy your frontend
3. Wait for all services to show "Live" status (usually 5-10 minutes)

## Step 5: Post-Deployment Setup

1. **Update URLs:**
   - Note your deployed URLs (e.g., `devbooking-api.onrender.com`)
   - Update `FRONTEND_URL` in the API service environment variables
   - Update `VITE_API_URL` in the frontend service environment variables
   - Redeploy both services

2. **Run Database Migrations:**
   - In the API service, go to "Shell" tab
   - Run: `node run-migrations.js`

3. **Create Admin User:**
   - In the API service shell, run:
   ```bash
   node scripts/ensure-admin.mjs
   ```

4. **Configure Webhooks (if using):**
   - **Twilio SMS Webhook:** `https://your-api-url.onrender.com/webhook/sms`
   - **Helcim Webhook:** `https://your-api-url.onrender.com/api/helcim/webhook`

## Step 6: Test Your Deployment

1. Visit your frontend URL: `https://devbooking-frontend.onrender.com`
2. Log in with the admin credentials you set
3. Test core functionality:
   - User authentication
   - Appointment booking
   - Client management

## Monitoring & Logs

- View logs in Render dashboard under each service
- Monitor database connections and performance
- Set up alerts for service health

## Scaling for Production

When ready for production:

1. **Upgrade Plans:**
   - API: Upgrade to "Starter" or higher for better performance
   - Database: Upgrade for more storage and connections
   - Add Redis for caching (uncomment in render.yaml)

2. **Custom Domain:**
   - Add your custom domain in Render settings
   - Update CORS settings accordingly

3. **Security:**
   - Enable 2FA on your Render account
   - Rotate API keys regularly
   - Set up proper backup strategies

## Troubleshooting

### Database Connection Issues
- Ensure `DATABASE_URL` is properly set
- Check if migrations ran successfully
- Verify PostgreSQL version compatibility

### Build Failures
- Check Node.js version requirements
- Ensure all dependencies are in package.json
- Review build logs for specific errors

### API Not Responding
- Check environment variables are set
- Verify CORS settings
- Review API logs for errors

### Frontend Not Loading
- Ensure `VITE_API_URL` points to correct API
- Check build output for errors
- Verify static file paths

## Support

For issues specific to:
- **Render Platform:** [Render Documentation](https://render.com/docs)
- **Application Issues:** Check the logs and error messages
- **Database Issues:** Use Render's database dashboard

## Next Steps

1. Set up monitoring and alerting
2. Configure automatic backups
3. Implement CI/CD with GitHub Actions
4. Add performance monitoring (e.g., Sentry, DataDog)

---

Remember to keep your environment variables secure and never commit them to your repository!
