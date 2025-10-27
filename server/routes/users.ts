import type { Express, Request, Response } from "express";
import type { IStorage } from "../storage.js";
import { z } from "zod";
import { insertUserSchema, insertUserColorPreferencesSchema, updateUserSchema, insertClientSchema } from "../../shared/schema.js";
import { hashPassword } from "../utils/password.js";

// Helper to validate request body using schema
function validateBody<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: Function) => {
    try {
      console.log("Validating body with schema:", JSON.stringify(req.body, null, 2));
      schema.parse(req.body);
      console.log("Validation successful");
      next();
    } catch (error) {
      console.log("Validation failed:", error);
      res.status(400).json({ error: "Invalid request body", details: error });
    }
  };
}

export function registerUserRoutes(app: Express, storage: IStorage) {
  // Minimal route to fetch a client's form submissions for reuse in calendar details
  app.get("/api/clients/:id/form-submissions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid client id" });
      }

      if (!(storage as any).getClientFormSubmissions) {
        return res.status(501).json({ error: "Form submissions not supported" });
      }

      const submissions = await (storage as any).getClientFormSubmissions(id);
      return res.json(submissions || []);
    } catch (error: any) {
      console.error("Error fetching client form submissions:", error);
      res.status(500).json({ error: "Failed to fetch form submissions" });
    }
  });

  // Lightweight lookup: find client(s) by exact email
  // Used by public booking flow to determine if a profile already exists
  app.get("/api/clients", async (req, res) => {
    try {
      const { email } = req.query as { email?: string };
      
      if (email && typeof email === "string" && email.trim()) {
        const results: any[] = [];
        const user = await storage.getUserByEmail(email.trim());
        if (user) {
          const { password, ...safeUser } = user as any;
          results.push(safeUser);
        }
        return res.json(results);
      }
      
      // When no email is specified, return all clients
      const allClients = await storage.getUsersByRole("client");
      const safeClients = allClients.map((client: any) => {
        const { password, ...safeClient } = client;
        return safeClient;
      });
      
      return res.json(safeClients);
    } catch (error: any) {
      console.error("Error looking up clients by email:", error);
      return res.status(500).json({ error: "Failed to lookup clients" });
    }
  });

  // Create client (admin/staff action)
  app.post("/api/clients", validateBody(insertClientSchema), async (req, res) => {
    try {
      const data = req.body as z.infer<typeof insertClientSchema>;
      
      // Log the incoming data to debug SMS preferences
      console.log("📱 [CREATE CLIENT] Incoming data from booking widget:", {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        smsAppointmentReminders: data.smsAppointmentReminders,
        emailAppointmentReminders: data.emailAppointmentReminders,
        hasSmsPref: 'smsAppointmentReminders' in data,
        hasEmailPref: 'emailAppointmentReminders' in data
      });

      // Basic duplicate checks
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        // Instead of blocking on duplicate email, return the existing user as a successful response
        const { password, ...safeExisting } = existingEmail as any;
        return res.status(200).json(safeExisting);
      }

      // Generate a username from email or name
      const baseFromEmail = (data.email || "").split("@")[0] || "client";
      const baseFromName = `${(data.firstName || "client").toLowerCase()}${(data.lastName || "").toLowerCase()}`;
      let baseUsername = (baseFromEmail || baseFromName).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!baseUsername) baseUsername = `client${Date.now()}`;

      let username = baseUsername;
      let suffix = 0;
      // Ensure unique username
      // Limit attempts then fall back to timestamp
      // eslint-disable-next-line no-constant-condition
      while (await storage.getUserByUsername(username)) {
        suffix += 1;
        if (suffix > 50) {
          username = `${baseUsername}${Date.now()}`;
          break;
        }
        username = `${baseUsername}${suffix}`;
      }

      // Temporary password (hashed)
      const tempPassword = `Temp123!${Math.random().toString(36).slice(-4)}`;
      const hashedPassword = await hashPassword(tempPassword);

      const newUser = await storage.createUser({
        username,
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "client",
        // Optional client fields
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        notes: (data as any).notes ?? null,
        emailAccountManagement: data.emailAccountManagement ?? true,
        emailAppointmentReminders: data.emailAppointmentReminders ?? true,
        emailPromotions: data.emailPromotions ?? true,
        smsAccountManagement: data.smsAccountManagement ?? false,
        smsAppointmentReminders: data.smsAppointmentReminders ?? true,
        smsPromotions: data.smsPromotions ?? true,
      } as any);

      const { password, ...safeUser } = newUser as any;
      return res.status(201).json(safeUser);
    } catch (error: any) {
      console.error("Error creating client:", error);
      // Handle unique constraint violations gracefully
      const message = error?.message || "Failed to create client";
      const status = message.toLowerCase().includes("unique") ? 409 : 500;
      return res.status(status).json({ error: "Failed to create client", message });
    }
  });

  // Bulk import clients
  app.post("/api/clients/import", async (req, res) => {
    try {
      const body = req.body as any;
      const clients = Array.isArray(body?.clients) ? body.clients : [];

      if (!Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ error: "Invalid payload: clients array is required" });
      }

      // Helpers
      const isValidEmail = (email: string | undefined | null) => {
        if (!email) return false;
        const e = String(email).trim();
        // basic email check
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
      };

      const sanitize = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Track seen emails within this batch to avoid duplicate inserts in one request
      const seenEmails = new Set<string>();

      // Preload existing users for quicker duplicate checks (email only)
      let existingEmails = new Set<string>();
      try {
        const allUsers = await storage.getAllUsers();
        existingEmails = new Set<string>(allUsers.map((u: any) => (u.email || '').toLowerCase()).filter(Boolean));
      } catch (e) {
        // If fetching all users fails, continue without pre-cache; rely on DB unique constraints
      }

      const generateFallbackEmail = (firstName: string, lastName: string, index: number) => {
        const base = `${(firstName || 'client').toLowerCase()}${(lastName || '')
          .toLowerCase()}`.replace(/[^a-z0-9]/g, '') || 'client';
        let candidate = `${base}.${Date.now()}-${index}@placeholder.local`;
        let counter = 0;
        while (seenEmails.has(candidate.toLowerCase()) || existingEmails.has(candidate.toLowerCase())) {
          counter += 1;
          candidate = `${base}.${Date.now()}-${index}-${counter}@placeholder.local`;
          if (counter > 50) break;
        }
        return candidate;
      };

      const ensureUniqueUsername = async (base: string) => {
        let username = base || `client${Date.now()}`;
        username = username.toLowerCase().replace(/[^a-z0-9]/g, '') || `client${Date.now()}`;
        let suffix = 0;
        // eslint-disable-next-line no-constant-condition
        while (await storage.getUserByUsername(username)) {
          suffix += 1;
          if (suffix > 50) {
            username = `${username}${Date.now()}`;
            break;
          }
          username = `${base}${suffix}`.toLowerCase().replace(/[^a-z0-9]/g, '') || `client${Date.now()}`;
        }
        return username;
      };

      // Pre-compute a single temporary password hash to avoid hashing 20k+ times
      const defaultTempPassword = `Temp123!${Math.random().toString(36).slice(-4)}`;
      const defaultHashedPassword = await hashPassword(defaultTempPassword);

      // Process with modest concurrency to handle large imports reliably
      const CONCURRENCY = 10;
      let currentIndex = 0;

      async function processOne(raw: any, index: number) {
        const firstName = sanitize(raw.firstName || raw.FirstName || raw['First name'] || raw['First Name']);
        const lastName = sanitize(raw.lastName || raw.LastName || raw['Last name'] || raw['Last Name']);
        const emailRaw = sanitize(raw.email || raw.Email);
        const phone = sanitize(raw.phone || raw.Phone || raw['Mobile phone'] || raw['Mobile Phone']);

        // Prepare email
        let email = emailRaw;
        if (!isValidEmail(email)) {
          email = generateFallbackEmail(firstName, lastName, index);
        }
        const emailLower = email.toLowerCase();
        if (seenEmails.has(emailLower) || existingEmails.has(emailLower)) {
          skipped += 1;
          errors.push(`Duplicate email skipped: ${email}`);
          return;
        }

        try {
          // Build username from email or names
          const baseFromEmail = (email.split('@')[0] || 'client').toLowerCase().replace(/[^a-z0-9]/g, '');
          const baseFromName = `${(firstName || 'client').toLowerCase()}${(lastName || '')
            .toLowerCase()}`.replace(/[^a-z0-9]/g, '');
          const baseUsername = baseFromEmail || baseFromName || `client${Date.now()}`;
          const username = await ensureUniqueUsername(baseUsername);

          await storage.createUser({
            username,
            email,
            password: defaultHashedPassword,
            firstName: firstName || null,
            lastName: lastName || null,
            role: "client",
            phone: phone || null,
            address: null,
            city: null,
            state: null,
            zipCode: null,
            notes: null,
            emailAccountManagement: true,
            emailAppointmentReminders: true,
            emailPromotions: true,
            smsAccountManagement: true,
            smsAppointmentReminders: true,
            smsPromotions: true,
          } as any);

          seenEmails.add(emailLower);
          imported += 1;
        } catch (err: any) {
          // Gracefully handle unique constraint violations and other errors
          const msg = err?.message || 'Unknown error';
          if (/unique/i.test(msg) || /duplicate/i.test(msg)) {
            skipped += 1;
            errors.push(`Duplicate skipped: ${email}`);
          } else {
            skipped += 1;
            errors.push(`Error importing ${email}: ${msg}`);
          }
        }
      }

      async function runBatch() {
        const workers: Promise<void>[] = [];
        for (let i = 0; i < CONCURRENCY && currentIndex < clients.length; i += 1) {
          const idx = currentIndex++;
          workers.push(processOne(clients[idx], idx));
        }
        await Promise.all(workers);
      }

      while (currentIndex < clients.length) {
        // eslint-disable-next-line no-await-in-loop
        await runBatch();
      }

      return res.json({ imported, skipped, errors });
    } catch (error: any) {
      console.error("Error importing clients:", error);
      return res.status(500).json({ error: "Failed to import clients", message: error?.message || String(error) });
    }
  });
  // TEMPORARY: Grant admin permissions to user 72
  app.post("/api/temp/grant-admin-72", async (req, res) => {
    try {
      // Get current user info
      const users = await storage.getAllUsers();
      const user = users.find(u => u.id === 72);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      console.log('Current user info:', {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      });

      if (user.role === 'admin') {
        return res.json({
          success: true,
          message: "User already has admin role",
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        });
      }

      // Update user role to admin
      const updatedUser = await storage.updateUser(user.id, { role: 'admin' });

      console.log('✅ Successfully granted admin permissions!');
      res.json({
        success: true,
        message: "Admin permissions granted successfully!",
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          role: updatedUser.role,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        }
      });
    } catch (error) {
      console.error('Error granting admin permissions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({
        success: false,
        message: "Failed to grant admin permissions",
        error: errorMessage
      });
    }
  });

  // Get all users
  app.get("/api/users", async (req, res) => {
    try {
      console.log("GET /api/users called - DEBUG VERSION");
      const { search, role, limit } = req.query;
      let users;
      
      if (search && typeof search === 'string') {
        // Search users by name, email, or phone
        users = await storage.searchUsers(search);

        // If search resembles an email, prioritize exact email match at the top
        const looksLikeEmail = /@/.test(search);
        if (looksLikeEmail) {
          try {
            const exact = await storage.getUserByEmail(search);
            if (exact) {
              const withoutExact = users.filter((u: any) => u.id !== exact.id);
              users = [exact, ...withoutExact];
            }
          } catch (e) {
            // keep original users on error
          }
        }

        // If role filter is also provided, filter results in-memory to avoid changing storage API
        if (role && typeof role === 'string') {
          users = users.filter((u: any) => u.role === role);
        }

        // Tokenized multi-word name fallback to surface strong matches like "first last"
        // This helps queries such as "bridgett ball" to show up reliably
        const containsSpace = /\s/.test(search);
        if (role && typeof role === 'string' && containsSpace) {
          try {
            const normalizedQuery = String(search).toLowerCase().trim().replace(/\s+/g, ' ');
            const tokens = normalizedQuery.split(' ').filter(Boolean);

            // Consider all users for strong matching, in case some were not labeled as client
            const candidateUsers: any[] = await storage.getAllUsers();

            type Scored = { user: any; score: number };
            const scored: Scored[] = [];

            for (const u of candidateUsers) {
              const first = (u.firstName || '').toLowerCase().trim();
              const last = (u.lastName || '').toLowerCase().trim();
              const full = `${first} ${last}`.trim().replace(/\s+/g, ' ');
              const reversed = `${last} ${first}`.trim().replace(/\s+/g, ' ');
              const emailLocal = String(u.email || '')
                .toLowerCase()
                .split('@')[0]
                .replace(/[._+\-]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');

              const candidateStrings = [full, reversed, emailLocal].filter(Boolean);

              let score = 0;
              if (candidateStrings.length && normalizedQuery) {
                if (full && full === normalizedQuery) {
                  score = 100;
                } else if (full && full.startsWith(normalizedQuery)) {
                  score = 90;
                } else if (tokens.length >= 2) {
                  const firstToken = tokens[0];
                  const lastToken = tokens[tokens.length - 1];
                  const bothPrefix = (first.startsWith(firstToken) && last.startsWith(lastToken)) ||
                                     (first.startsWith(lastToken) && last.startsWith(firstToken));
                  if (bothPrefix) {
                    score = 80;
                  } else if (tokens.every(t => candidateStrings.some(s => s.includes(t)))) {
                    score = 60;
                  }
                } else if (tokens.length === 1) {
                  const t0 = tokens[0];
                  if (candidateStrings.some(s => s.startsWith(t0))) {
                    score = 50;
                  } else if (candidateStrings.some(s => s.includes(t0))) {
                    score = 40;
                  }
                }
              }

              if (score > 0) {
                scored.push({ user: u, score });
              }
            }

            if (scored.length > 0) {
              scored.sort((a, b) => b.score - a.score);
              const strongMatchesUnfiltered = scored.map(s => s.user);
              let strongMatches = strongMatchesUnfiltered;

              // If role filter is present, try to keep only that role first
              if (role && typeof role === 'string') {
                const byRole = strongMatches.filter((u: any) => u.role === role);
                // If none remain after filtering by role, fall back to unfiltered strong matches
                strongMatches = byRole.length > 0 ? byRole : strongMatchesUnfiltered;
              }

              // Merge strong matches to the top, deduplicating by id
              const seen = new Set<number>();
              const merged: any[] = [];
              for (const u of strongMatches) {
                if (!seen.has(u.id)) {
                  seen.add(u.id);
                  merged.push(u);
                }
              }
              for (const u of users) {
                if (!seen.has(u.id)) {
                  seen.add(u.id);
                  merged.push(u);
                }
              }
              users = merged;
            }
          } catch (e) {
            // On any failure, keep the original users array
          }
        }
      } else if (role && typeof role === 'string') {
        // Filter users by role
        users = await storage.getUsersByRole(role);
      } else {
        users = await storage.getAllUsers();
      }
      
      console.log("Users found:", users.length);
      if (users.length > 0) {
        console.log("First user object:", users[0]);
        console.log("First user keys:", Object.keys(users[0]));
      }
      
      // Remove sensitive information
      const safeUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      // Apply limit if specified
      let limitedUsers = safeUsers;
      if (limit && typeof limit === 'string') {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          limitedUsers = safeUsers.slice(0, limitNum);
          console.log(`Applied limit of ${limitNum}, returning ${limitedUsers.length} out of ${safeUsers.length} users`);
        }
      }
      
      // Debug log: print the first user object and its keys
      if (limitedUsers.length > 0) {
        console.log('API response - first user object:', limitedUsers[0]);
        console.log('API response - first user keys:', Object.keys(limitedUsers[0]));
        
        // Check if phone field exists in the response
        const firstUser = limitedUsers[0];
        console.log('Phone field check:', {
          hasPhone: 'phone' in firstUser,
          phoneValue: firstUser.phone,
          phoneType: typeof firstUser.phone,
          phoneLength: firstUser.phone?.length
        });
        
        // Check how many users have phone numbers
        const usersWithPhones = limitedUsers.filter((u: any) => u.phone && u.phone.trim() !== '');
        console.log('Users with phones in API response:', usersWithPhones.length, 'out of', limitedUsers.length);
      }

      res.json(limitedUsers);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users: " + error.message });
    }
  });

  // Update user
  app.put("/api/users/:id", validateBody(updateUserSchema), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      console.log("Updating user with data:", JSON.stringify(req.body, null, 2));
      
      const updatedUser = await storage.updateUser(userId, req.body);
      console.log("User updated successfully:", JSON.stringify(updatedUser, null, 2));
      
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user:", error);
      
      // Handle specific error types
      if (error.message.includes("already in use by another user")) {
        res.status(409).json({ error: error.message });
      } else if (error.message.includes("User not found")) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update user: " + error.message });
      }
    }
  });

  // Patch user (partial update)
  app.patch("/api/users/:id", validateBody(updateUserSchema), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      console.log("PATCH - Updating user with data:", JSON.stringify(req.body, null, 2));
      
      const updatedUser = await storage.updateUser(userId, req.body);
      console.log("PATCH - User updated successfully:", JSON.stringify(updatedUser, null, 2));
      
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user:", error);
      
      // Handle specific error types
      if (error.message.includes("already in use by another user")) {
        res.status(409).json({ error: error.message });
      } else if (error.message.includes("User not found")) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update user: " + error.message });
      }
    }
  });

  // Delete user
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      console.log(`Attempting to delete user with ID: ${userId}`);

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        console.log(`User with ID ${userId} not found`);
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`User exists, proceeding with deletion:`, existingUser);
      const deleted = await storage.deleteUser(userId);
      console.log(`Deletion result:`, deleted);

      if (deleted) {
        console.log(`User ${userId} deleted successfully`);
        res.json({ success: true, message: "User deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete user" });
      }
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user: " + error.message });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Remove sensitive information
      const safeUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        // Include non-sensitive contact/profile fields so client edit dialogs populate correctly
        phone: (user as any).phone ?? null,
        address: (user as any).address ?? null,
        city: (user as any).city ?? null,
        state: (user as any).state ?? null,
        zipCode: (user as any).zipCode ?? null,
        notes: (user as any).notes ?? null,
        profilePicture: (user as any).profilePicture ?? null,
        birthday: (user as any).birthday ?? null,
        emailAccountManagement: (user as any).emailAccountManagement ?? true,
        emailAppointmentReminders: (user as any).emailAppointmentReminders ?? true,
        emailPromotions: (user as any).emailPromotions ?? false,
        smsAccountManagement: (user as any).smsAccountManagement ?? false,
        smsAppointmentReminders: (user as any).smsAppointmentReminders ?? true,
        smsPromotions: (user as any).smsPromotions ?? false,
        createdAt: user.createdAt,
      };

      res.json(safeUser);
    } catch (error: any) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user: " + error.message });
    }
  });

  // Get user color preferences
  app.get("/api/users/:id/color-preferences", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const preferences = await storage.getUserColorPreferences(userId);
      res.json(preferences || {});
    } catch (error: any) {
      console.error("Error fetching user color preferences:", error);
      res.status(500).json({ error: "Failed to fetch color preferences: " + error.message });
    }
  });

  // Update user color preferences
  app.put("/api/users/:id/color-preferences", validateBody(insertUserColorPreferencesSchema.partial()), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      console.log(`Saving color preferences for user ${userId}:`, req.body);

      // Delete existing preferences
      const deleted = await storage.deleteUserColorPreferences(userId);
      console.log(`Deleted existing color preferences for user ${userId}:`, deleted);

      // Create new preferences
      const result = await storage.createUserColorPreferences({
        userId,
        ...req.body
      });
      console.log(`Created new color preferences for user ${userId}:`, result);

      res.json(result);
    } catch (error: any) {
      console.error("Error updating user color preferences:", error);
      res.status(500).json({ error: "Failed to update color preferences: " + error.message });
    }
  });
} 