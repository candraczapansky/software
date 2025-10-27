import { db } from '../db/drizzle.js';
import { sql } from 'drizzle-orm';

class DatabaseMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds
  private isConnected = true;
  private lastCheckTime = Date.now();

  constructor() {
    this.startMonitoring();
  }

  private async checkConnection(): Promise<boolean> {
    try {
      // Simple query to check if database is responsive
      await db.execute(sql`SELECT 1`);
      return true;
    } catch (error) {
      console.error('Database connection check failed:', error);
      return false;
    }
  }

  private async handleDisconnection() {
    this.isConnected = false;
    console.error('⚠️  Database connection lost! Attempting to reconnect...');

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

      // Wait before attempting reconnection
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

      try {
        const connected = await this.checkConnection();
        if (connected) {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ Database connection restored!');
          return;
        }
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
      }

      // Exponential backoff for reconnection delay
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
    }

    console.error('❌ Failed to reconnect to database after maximum attempts');
    console.error('Please check your database server and connection settings');
    
    // In production, you might want to alert administrators or trigger a restart
    if (process.env.NODE_ENV === 'production') {
      // Could send alert email, restart process, etc.
      console.error('CRITICAL: Database connection could not be restored');
      // Optionally exit the process to trigger a restart by process manager
      // process.exit(1);
    }
  }

  private startMonitoring() {
    // Check connection every 30 seconds
    this.checkInterval = setInterval(async () => {
      const now = Date.now();
      
      // Prevent overlapping checks
      if (now - this.lastCheckTime < 25000) {
        return;
      }
      
      this.lastCheckTime = now;

      try {
        const connected = await this.checkConnection();
        
        if (!connected && this.isConnected) {
          // Connection was lost
          await this.handleDisconnection();
        } else if (connected && !this.isConnected) {
          // Connection was restored
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ Database connection verified');
        }
      } catch (error) {
        console.error('Database monitoring error:', error);
        if (this.isConnected) {
          await this.handleDisconnection();
        }
      }
    }, 30000); // Check every 30 seconds

    // Initial check
    this.checkConnection().then(connected => {
      if (connected) {
        console.log('✅ Database connection verified on startup');
      } else {
        console.error('⚠️  Initial database connection failed');
        this.handleDisconnection();
      }
    });

    // Clean up on process termination
    process.on('SIGINT', () => this.stopMonitoring());
    process.on('SIGTERM', () => this.stopMonitoring());
  }

  public stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Database monitoring stopped');
    }
  }

  public getStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastCheckTime: new Date(this.lastCheckTime).toISOString()
    };
  }
}

// Export singleton instance
export const databaseMonitor = new DatabaseMonitor();

// Export for use in health checks
export function getDatabaseStatus() {
  return databaseMonitor.getStatus();
}
