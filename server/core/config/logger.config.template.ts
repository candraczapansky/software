export interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'text';
  outputs: ('console' | 'file')[];
  file?: {
    directory: string;
    maxSize: string;
    maxFiles: number;
  };
}

export const loggerConfig: LoggerConfig = {
  level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
  format: (process.env.LOG_FORMAT || 'json') as 'json' | 'text',
  outputs: (process.env.LOG_OUTPUTS || 'console').split(',') as ('console' | 'file')[],
  file: process.env.LOG_TO_FILE === 'true' ? {
    directory: process.env.LOG_DIRECTORY || 'logs',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '7')
  } : undefined
};
