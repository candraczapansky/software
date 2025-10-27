import { Router } from 'express';
import { z } from 'zod';
import { HelcimTerminalService } from '../services/helcim-terminal-service.js';
import { HelcimApiClient } from '../services/helcim-api-client.js';
import type { IStorage } from '../storage.js';
import { TerminalConfigService } from '../services/terminal-config-service.js';
import { log } from '../log.js';
import { triggerAfterPayment } from '../automation-triggers.js';

// Factory to create router with storage dependency
export default function createTerminalRoutes(storage: IStorage) {
  const router = Router();
  const configService = new TerminalConfigService(storage);
  const terminalService: any = (storage as any).__terminalService || new HelcimTerminalService(configService);
  (storage as any).__terminalService = terminalService;
  const helcimApiClient = new HelcimApiClient();

  // Temporary placeholder route
  router.get('/status', (req, res) => {
      res.json({ status: 'ok' });
  });

  return router;
}