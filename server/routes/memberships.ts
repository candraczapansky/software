import type { Express, Request, Response } from "express";
import type { IStorage } from "../storage.js";
import { z } from "zod";
import {
  insertMembershipSchema,
  insertClientMembershipSchema,
} from "../../shared/schema.js";
import {
  NotFoundError,
  asyncHandler,
} from "../utils/errors.js";
import LoggerService, { getLogContext } from "../utils/logger.js";
import { validateRequest } from "../middleware/error-handler.js";
import { invalidateCache } from "../utils/cache.js";

export function registerMembershipRoutes(app: Express, storage: IStorage) {
  // ----------------------
  // Membership Plans
  // ----------------------

  // List all memberships
  app.get(
    "/api/memberships",
    asyncHandler(async (req: Request, res: Response) => {
      const context = getLogContext(req);
      LoggerService.debug("Fetching memberships", context);

      const list = await storage.getAllMemberships();
      LoggerService.info("Memberships fetched", { ...context, count: list.length });
      res.json(list);
    })
  );

  // Get membership by ID
  app.get(
    "/api/memberships/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const membershipId = parseInt(req.params.id);
      const context = getLogContext(req);
      LoggerService.debug("Fetching membership", { ...context, membershipId });

      const membership = await storage.getMembership(membershipId);
      if (!membership) {
        throw new NotFoundError("Membership");
      }
      res.json(membership);
    })
  );

  // Create membership
  app.post(
    "/api/memberships",
    validateRequest(insertMembershipSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const context = getLogContext(req);
      const data = req.body;
      LoggerService.info("Creating membership", { ...context });

      const created = await storage.createMembership(data);

      invalidateCache("memberships");
      invalidateCache("api:GET:/api/memberships");

      LoggerService.info("Membership created", { ...context, membershipId: created.id });
      res.status(201).json(created);
    })
  );

  // Update membership
  app.put(
    "/api/memberships/:id",
    validateRequest(insertMembershipSchema.partial()),
    asyncHandler(async (req: Request, res: Response) => {
      const membershipId = parseInt(req.params.id);
      const context = getLogContext(req);
      const updateData = req.body;

      LoggerService.info("Updating membership", { ...context, membershipId });

      const existing = await storage.getMembership(membershipId);
      if (!existing) {
        throw new NotFoundError("Membership");
      }

      const updated = await storage.updateMembership(membershipId, updateData);

      invalidateCache("memberships");
      invalidateCache(`membership:${membershipId}`);
      invalidateCache("api:GET:/api/memberships");

      res.json(updated);
    })
  );

  // Delete membership
  app.delete(
    "/api/memberships/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const membershipId = parseInt(req.params.id);
      const context = getLogContext(req);
      LoggerService.info("Deleting membership", { ...context, membershipId });

      const existing = await storage.getMembership(membershipId);
      if (!existing) {
        throw new NotFoundError("Membership");
      }

      await storage.deleteMembership(membershipId);

      invalidateCache("memberships");
      invalidateCache(`membership:${membershipId}`);
      invalidateCache("api:GET:/api/memberships");

      res.json({ success: true, message: "Membership deleted successfully" });
    })
  );

  // ----------------------
  // Client Memberships (Subscriptions)
  // ----------------------

  // List client memberships, filterable by clientId or membershipId
  app.get(
    "/api/client-memberships",
    asyncHandler(async (req: Request, res: Response) => {
      const context = getLogContext(req);
      const { clientId, membershipId } = req.query as Record<string, string | undefined>;
      LoggerService.debug("Fetching client memberships", { ...context, clientId, membershipId });

      let list;
      if (clientId) {
        list = await storage.getClientMembershipsByClient(parseInt(clientId));
      } else if (membershipId) {
        list = await storage.getClientMembershipsByMembership(parseInt(membershipId));
      } else {
        list = await storage.getAllClientMemberships();
      }

      // Enrich with related client and membership info
      const enriched = await Promise.all(
        list.map(async (cm: any) => {
          const [client, membership] = await Promise.all([
            storage.getUser(cm.clientId),
            storage.getMembership(cm.membershipId),
          ]);
          return {
            ...cm,
            client: client || null,
            membership: membership || null,
          };
        })
      );

      LoggerService.info("Client memberships fetched", { ...context, count: enriched.length });
      res.json(enriched);
    })
  );

  // Create client membership
  app.post(
    "/api/client-memberships",
    validateRequest(
      insertClientMembershipSchema.extend({
        // Ensure booleans/dates can be passed as strings and coerced appropriately if needed
        active: z.boolean().optional(),
      })
    ),
    asyncHandler(async (req: Request, res: Response) => {
      const context = getLogContext(req);
      const data = req.body;
      LoggerService.info("Creating client membership", { ...context, clientId: data.clientId, membershipId: data.membershipId });

      const created = await storage.createClientMembership(data);

      invalidateCache("client-memberships");
      invalidateCache("api:GET:/api/client-memberships");

      res.status(201).json(created);
    })
  );

  // Get a specific client membership by ID
  app.get(
    "/api/client-memberships/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const id = parseInt(req.params.id);
      const context = getLogContext(req);
      
      LoggerService.info("Fetching client membership", { ...context, id });
      
      const clientMembership = await storage.getClientMembership(id);
      if (!clientMembership) {
        throw new NotFoundError(`Client membership with ID ${id} not found`);
      }
      
      // Get the membership details
      const membership = await storage.getMembership(clientMembership.membershipId);
      
      // Get the client details
      const client = await storage.getUser(clientMembership.clientId);
      
      // Combine the data
      const result = {
        ...clientMembership,
        membership: membership,
        client: client
      };
      
      res.json(result);
    })
  );

  // Update client membership (for toggling auto-renewal, editing dates, etc.)
  app.put(
    "/api/client-memberships/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const id = parseInt(req.params.id);
      const context = getLogContext(req);
      const { autoRenew, active, renewalDay, paymentMethodId, startDate, endDate } = req.body;

      LoggerService.info("Updating client membership", { 
        ...context, 
        membershipId: id,
        updates: req.body 
      });

      // Check if membership exists
      const membership = await storage.getClientMembership(id);
      if (!membership) {
        throw new NotFoundError(`Client membership with ID ${id} not found`);
      }

      // Update the membership
      const updateData: any = {};
      if (autoRenew !== undefined) updateData.autoRenew = autoRenew;
      if (active !== undefined) updateData.active = active;
      if (renewalDay !== undefined) updateData.renewalDay = renewalDay;
      if (paymentMethodId !== undefined) updateData.paymentMethodId = paymentMethodId;
      if (startDate !== undefined) updateData.startDate = new Date(startDate);
      if (endDate !== undefined) updateData.endDate = new Date(endDate);

      const updated = await storage.updateClientMembership(id, updateData);

      invalidateCache("client-memberships");
      invalidateCache(`client-membership:${id}`);
      invalidateCache("api:GET:/api/client-memberships");

      res.json(updated);
    })
  );

  // Delete client membership
  app.delete(
    "/api/client-memberships/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const id = parseInt(req.params.id);
      const context = getLogContext(req);
      LoggerService.info("Deleting client membership", { ...context, id });

      const existing = await storage.getClientMembership(id);
      if (!existing) {
        throw new NotFoundError("Client membership");
      }

      await storage.deleteClientMembership(id);

      invalidateCache("client-memberships");
      invalidateCache(`client-membership:${id}`);
      invalidateCache("api:GET:/api/client-memberships");

      res.json({ success: true, message: "Client membership deleted successfully" });
    })
  );
}


