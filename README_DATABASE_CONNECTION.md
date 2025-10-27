# Database Connection Management

## Problem Solved
The application was experiencing frequent database disconnections, requiring manual server restarts. This guide explains the solutions implemented to prevent this issue.

## Solutions Implemented

### 1. Automatic Database Monitoring (`server/utils/database-monitor.ts`)
- **Continuous Health Checks**: Monitors database connection every 30 seconds
- **Automatic Reconnection**: Attempts to reconnect up to 5 times with exponential backoff
- **Status Reporting**: Provides real-time connection status via the health endpoint
- **Graceful Shutdown**: Properly cleans up monitoring on server termination

### 2. Improved Startup Scripts

#### Quick Start (Recommended)
```bash
# Starts both frontend and backend with automatic recovery
npm run dev:all
```

#### Alternative Start Commands
```bash
# Start backend only (database server)
npm run dev:backend

# Start frontend only (Vite)
npm run dev:frontend

# Legacy command (backend only)
npm run dev
```

### 3. Automatic Recovery Script (`start-dev.sh`)
Features:
- Kills stale processes on startup
- Clears Vite cache if needed
- Monitors both servers and restarts them if they crash
- Shows clear status messages
- Provides single command to start everything

### 4. Health Check Endpoint
```bash
# Check server and database status
curl http://localhost:3002/api/health
```

Returns:
```json
{
  "success": true,
  "status": "healthy",
  "services": {
    "database": "connected",
    "email": "configured",
    "sms": "configured"
  },
  "databaseMonitor": {
    "isConnected": true,
    "reconnectAttempts": 0,
    "lastCheckTime": "2025-10-23T05:06:01.216Z"
  }
}
```

## How It Works

1. **On Startup**: 
   - Database monitor starts automatically when server starts
   - Initial connection check is performed
   - Monitor begins 30-second interval checks

2. **During Operation**:
   - Every 30 seconds, the monitor pings the database
   - If connection is lost, automatic reconnection attempts begin
   - Uses exponential backoff (5s, 10s, 20s, 30s, 30s)
   - After 5 failed attempts, alerts are logged

3. **Recovery**:
   - When connection is restored, normal monitoring resumes
   - All database queries will work again automatically
   - No manual intervention required

## Troubleshooting

### If Database Disconnects Persist

1. **Check Database Server**:
   ```bash
   # For SQLite
   ls -la data/database.db
   
   # Check disk space
   df -h
   ```

2. **Check Server Logs**:
   ```bash
   # View recent logs
   tail -f server.log
   ```

3. **Restart Everything**:
   ```bash
   # Kill all processes
   pkill -f vite
   pkill -f tsx
   
   # Start fresh
   npm run dev:all
   ```

4. **Clear All Caches**:
   ```bash
   rm -rf node_modules/.vite .vite dist
   npm run dev:all
   ```

## Prevention Tips

1. **Always use `npm run dev:all`** for development - it includes automatic recovery
2. **Monitor the health endpoint** if you notice issues
3. **Check disk space** - SQLite needs free space for WAL files
4. **Keep dependencies updated** - Run `npm update` periodically

## Architecture Notes

- **Database**: SQLite with WAL mode for better concurrency
- **Connection Pool**: Handled by Drizzle ORM
- **Monitor**: Runs in-process, no external dependencies
- **Recovery**: Automatic with exponential backoff
- **Logging**: All connection events are logged to console

This system ensures your database connection remains stable and recovers automatically from temporary disruptions.
