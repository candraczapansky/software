import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { supplies } from '../../shared/schema.js';
import { eq, and, ilike, sql } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get all supplies for a location
router.get('/supplies', authenticateToken, async (req: Request, res: Response) => {
  try {
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : null;
    
    let query = db.select().from(supplies);
    if (locationId) {
      query = query.where(eq(supplies.locationId, locationId));
    }
    
    const result = await query.orderBy(supplies.category, supplies.name);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching supplies:', error);
    res.status(500).json({ error: 'Failed to fetch supplies' });
  }
});

// Get single supply
router.get('/supplies/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [supply] = await db
      .select()
      .from(supplies)
      .where(eq(supplies.id, parseInt(id)))
      .limit(1);
    
    if (!supply) {
      return res.status(404).json({ error: 'Supply not found' });
    }
    
    res.json(supply);
  } catch (error) {
    console.error('Error fetching supply:', error);
    res.status(500).json({ error: 'Failed to fetch supply' });
  }
});

// Create new supply
router.post('/supplies', authenticateToken, async (req: Request, res: Response) => {
  try {
    const {
      name,
      category,
      weightValue,
      weightUnit,
      currentStock,
      recommendedStock,
      notes,
      locationId
    } = req.body;
    
    const [newSupply] = await db
      .insert(supplies)
      .values({
        name,
        category,
        weightValue: parseFloat(weightValue),
        weightUnit,
        currentStock: parseFloat(currentStock),
        recommendedStock: parseFloat(recommendedStock),
        notes,
        locationId: locationId ? parseInt(locationId) : null,
      })
      .returning();
    
    res.json(newSupply);
  } catch (error) {
    console.error('Error creating supply:', error);
    res.status(500).json({ error: 'Failed to create supply' });
  }
});

// Update supply
router.put('/supplies/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      weightValue,
      weightUnit,
      currentStock,
      recommendedStock,
      notes,
      locationId
    } = req.body;
    
    const [updatedSupply] = await db
      .update(supplies)
      .set({
        name,
        category,
        weightValue: parseFloat(weightValue),
        weightUnit,
        currentStock: parseFloat(currentStock),
        recommendedStock: parseFloat(recommendedStock),
        notes,
        locationId: locationId ? parseInt(locationId) : null,
        updatedAt: new Date(),
      })
      .where(eq(supplies.id, parseInt(id)))
      .returning();
    
    if (!updatedSupply) {
      return res.status(404).json({ error: 'Supply not found' });
    }
    
    res.json(updatedSupply);
  } catch (error) {
    console.error('Error updating supply:', error);
    res.status(500).json({ error: 'Failed to update supply' });
  }
});

// Delete supply
router.delete('/supplies/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [deleted] = await db
      .delete(supplies)
      .where(eq(supplies.id, parseInt(id)))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Supply not found' });
    }
    
    res.json({ message: 'Supply deleted successfully' });
  } catch (error) {
    console.error('Error deleting supply:', error);
    res.status(500).json({ error: 'Failed to delete supply' });
  }
});

// Update stock levels
router.patch('/supplies/:id/stock', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentStock } = req.body;
    
    const [updatedSupply] = await db
      .update(supplies)
      .set({
        currentStock: parseFloat(currentStock),
        updatedAt: new Date(),
      })
      .where(eq(supplies.id, parseInt(id)))
      .returning();
    
    if (!updatedSupply) {
      return res.status(404).json({ error: 'Supply not found' });
    }
    
    res.json(updatedSupply);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

export default router;
