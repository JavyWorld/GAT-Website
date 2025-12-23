import type { Express } from "express";
import { authStorage } from "./storage";
import { storage } from "../../storage";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user - PUBLIC (returns null if not authenticated)
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Check if user is authenticated without requiring it
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Check if current user is an admin
  app.get("/api/auth/admin", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json({ isAdmin: false, noAdmins: false });
      }
      const userId = req.user.claims.sub;
      const settings = await storage.getGuildSettings();
      const adminUserIds = settings?.adminUserIds || [];
      
      // If there are no admins, allow any authenticated user to become the first admin
      if (adminUserIds.length === 0) {
        return res.json({ isAdmin: true, noAdmins: true });
      }
      
      const isAdmin = adminUserIds.includes(userId);
      res.json({ isAdmin, noAdmins: false });
    } catch (error) {
      console.error("Error checking admin status:", error);
      res.status(500).json({ message: "Failed to check admin status" });
    }
  });

  // Add current user as admin (only works if no admins exist or called by an admin)
  app.post("/api/auth/admin/add-self", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.user.claims.sub;
      const settings = await storage.getGuildSettings();
      const adminUserIds = settings?.adminUserIds || [];
      
      // Only allow if no admins exist (first admin setup)
      if (adminUserIds.length > 0 && !adminUserIds.includes(userId)) {
        return res.status(403).json({ message: "Only existing admins can add new admins" });
      }
      
      if (!adminUserIds.includes(userId)) {
        const newAdminIds = [...adminUserIds, userId];
        await storage.updateGuildSettings({ 
          ...settings!,
          adminUserIds: newAdminIds 
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding admin:", error);
      res.status(500).json({ message: "Failed to add admin" });
    }
  });
}
