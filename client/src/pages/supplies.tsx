import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Edit, Trash2, Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation as useBusinessLocation } from "@/contexts/LocationContext";

type SupplyItem = {
  id: number;
  name: string;
  category?: string;
  weightValue: number; // e.g., 64
  weightUnit: string; // e.g., oz, ml, rolls
  currentStock: number; // number of units/packs on hand
  recommendedStock: number; // suggested on-hand count
  notes?: string;
  locationId?: number;
  createdAt: string;
  updatedAt: string;
};

type SupplyForm = {
  name: string;
  category: string;
  weightValue: number;
  weightUnit: string;
  currentStock: number;
  recommendedStock: number;
  notes: string;
};

export default function SuppliesPage() {
  const { toast } = useToast();
  const { selectedLocation } = useBusinessLocation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SupplyItem | null>(null);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<SupplyForm>({
    name: "",
    category: "",
    weightValue: 0,
    weightUnit: "",
    currentStock: 0,
    recommendedStock: 0,
    notes: "",
  });

  // Fetch supplies from the database
  const fetchSupplies = useCallback(async () => {
    setIsLoading(true);
    try {
      const queryParams = selectedLocation?.id 
        ? `?locationId=${selectedLocation.id}` 
        : '';
      
      const response = await fetch(`/api/supplies${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch supplies');
      }
      
      const data = await response.json();
      setSupplies(data);
    } catch (error) {
      console.error('Error fetching supplies:', error);
      toast({
        title: "Error",
        description: "Failed to load supplies. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocation?.id, toast]);

  // Load supplies on component mount or location change
  useEffect(() => {
    fetchSupplies();
  }, [fetchSupplies]);

  const handleAddSupply = async () => {
    if (!form.name || !form.weightUnit) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/supplies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          ...form,
          locationId: selectedLocation?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add supply');
      }

      const newSupply = await response.json();
      setSupplies([...supplies, newSupply]);
      
      toast({
        title: "Supply added",
        description: `${form.name} has been added to inventory.`,
      });

      setIsAddDialogOpen(false);
      setForm({
        name: "",
        category: "",
        weightValue: 0,
        weightUnit: "",
        currentStock: 0,
        recommendedStock: 0,
        notes: "",
      });
    } catch (error) {
      console.error('Error adding supply:', error);
      toast({
        title: "Error",
        description: "Failed to add supply. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditSupply = async () => {
    if (!editingItem || !form.name || !form.weightUnit) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/supplies/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          ...form,
          locationId: selectedLocation?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update supply');
      }

      const updatedSupply = await response.json();
      setSupplies(supplies.map((s) => 
        s.id === updatedSupply.id ? updatedSupply : s
      ));
      
      toast({
        title: "Supply updated",
        description: `${form.name} has been updated.`,
      });

      setIsEditDialogOpen(false);
      setEditingItem(null);
      setForm({
        name: "",
        category: "",
        weightValue: 0,
        weightUnit: "",
        currentStock: 0,
        recommendedStock: 0,
        notes: "",
      });
    } catch (error) {
      console.error('Error updating supply:', error);
      toast({
        title: "Error",
        description: "Failed to update supply. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSupply = async (id: number) => {
    if (!confirm("Are you sure you want to delete this supply?")) return;

    try {
      const response = await fetch(`/api/supplies/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete supply');
      }

      setSupplies(supplies.filter((s) => s.id !== id));
      
      toast({
        title: "Supply deleted",
        description: "The supply has been removed from inventory.",
      });
    } catch (error) {
      console.error('Error deleting supply:', error);
      toast({
        title: "Error",
        description: "Failed to delete supply. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStock = async (id: number, newStock: number) => {
    try {
      const response = await fetch(`/api/supplies/${id}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          currentStock: newStock,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update stock');
      }

      const updatedSupply = await response.json();
      setSupplies(supplies.map((s) => 
        s.id === updatedSupply.id ? updatedSupply : s
      ));
      
      toast({
        title: "Stock updated",
        description: "Stock level has been updated.",
      });
    } catch (error) {
      console.error('Error updating stock:', error);
      toast({
        title: "Error",
        description: "Failed to update stock. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (item: SupplyItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      category: item.category || "",
      weightValue: item.weightValue,
      weightUnit: item.weightUnit,
      currentStock: item.currentStock,
      recommendedStock: item.recommendedStock,
      notes: item.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  // Filter supplies based on search query
  const filteredSupplies = supplies.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group supplies by category
  const suppliesByCategory = filteredSupplies.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, SupplyItem[]>);

  // Get unique categories for the select dropdown
  const categories = [...new Set(supplies.map((s) => s.category).filter(Boolean))];
  const units = ["oz", "ml", "g", "kg", "lb", "rolls", "units", "packs", "boxes", "bottles"];

  // Calculate low stock items
  const lowStockItems = supplies.filter(
    (item) => item.currentStock < item.recommendedStock
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading supplies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Supplies Inventory</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your shop supplies and inventory
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Supply
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Supply</DialogTitle>
              <DialogDescription>
                Add a new item to your supplies inventory.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Shampoo 64oz"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g., Hair Care, Retail, Back Bar"
                  list="categories"
                />
                <datalist id="categories">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weightValue">Package Size *</Label>
                  <Input
                    id="weightValue"
                    type="number"
                    value={form.weightValue}
                    onChange={(e) =>
                      setForm({ ...form, weightValue: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="64"
                  />
                </div>
                <div>
                  <Label htmlFor="weightUnit">Unit *</Label>
                  <Select
                    value={form.weightUnit}
                    onValueChange={(value) => setForm({ ...form, weightUnit: value })}
                  >
                    <SelectTrigger id="weightUnit">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="currentStock">Current Stock</Label>
                  <Input
                    id="currentStock"
                    type="number"
                    value={form.currentStock}
                    onChange={(e) =>
                      setForm({ ...form, currentStock: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="recommendedStock">Recommended Stock</Label>
                  <Input
                    id="recommendedStock"
                    type="number"
                    value={form.recommendedStock}
                    onChange={(e) =>
                      setForm({ ...form, recommendedStock: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional information..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSupply}>Add Supply</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-orange-600" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} below
              recommended stock levels:
            </p>
            <div className="space-y-1">
              {lowStockItems.slice(0, 5).map((item) => (
                <div key={item.id} className="text-sm">
                  <span className="font-medium">{item.name}</span> -{" "}
                  <span className="text-orange-600">
                    {item.currentStock} / {item.recommendedStock} in stock
                  </span>
                </div>
              ))}
              {lowStockItems.length > 5 && (
                <p className="text-sm text-muted-foreground">
                  ...and {lowStockItems.length - 5} more
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center space-x-2">
        <Search className="w-5 h-5 text-muted-foreground" />
        <Input
          placeholder="Search supplies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Supplies Table */}
      {filteredSupplies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No supplies found" : "No supplies yet"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Start by adding your first supply item to track inventory"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Supply
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(suppliesByCategory).map(([category, items]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-lg">{category}</CardTitle>
                <CardDescription>{items.length} items</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-center">Current Stock</TableHead>
                      <TableHead className="text-center">Recommended</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const stockPercentage =
                        item.recommendedStock > 0
                          ? (item.currentStock / item.recommendedStock) * 100
                          : 100;
                      const stockStatus =
                        stockPercentage >= 100
                          ? "full"
                          : stockPercentage >= 50
                          ? "good"
                          : stockPercentage >= 25
                          ? "low"
                          : "critical";

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            {item.weightValue} {item.weightUnit}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              value={item.currentStock}
                              onChange={(e) => {
                                const newValue = parseFloat(e.target.value) || 0;
                                handleUpdateStock(item.id, newValue);
                              }}
                              className="w-20 text-center mx-auto"
                              min="0"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            {item.recommendedStock}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                stockStatus === "full"
                                  ? "default"
                                  : stockStatus === "good"
                                  ? "secondary"
                                  : stockStatus === "low"
                                  ? "outline"
                                  : "destructive"
                              }
                            >
                              {stockStatus === "full"
                                ? "Full"
                                : stockStatus === "good"
                                ? "Good"
                                : stockStatus === "low"
                                ? "Low"
                                : "Critical"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <span className="text-sm text-muted-foreground truncate">
                              {item.notes || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(item)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteSupply(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Supply</DialogTitle>
            <DialogDescription>
              Make changes to your supply item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Shampoo 64oz"
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Input
                id="edit-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g., Hair Care, Retail, Back Bar"
                list="edit-categories"
              />
              <datalist id="edit-categories">
                {categories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-weightValue">Package Size *</Label>
                <Input
                  id="edit-weightValue"
                  type="number"
                  value={form.weightValue}
                  onChange={(e) =>
                    setForm({ ...form, weightValue: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="64"
                />
              </div>
              <div>
                <Label htmlFor="edit-weightUnit">Unit *</Label>
                <Select
                  value={form.weightUnit}
                  onValueChange={(value) => setForm({ ...form, weightUnit: value })}
                >
                  <SelectTrigger id="edit-weightUnit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-currentStock">Current Stock</Label>
                <Input
                  id="edit-currentStock"
                  type="number"
                  value={form.currentStock}
                  onChange={(e) =>
                    setForm({ ...form, currentStock: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="edit-recommendedStock">Recommended Stock</Label>
                <Input
                  id="edit-recommendedStock"
                  type="number"
                  value={form.recommendedStock}
                  onChange={(e) =>
                    setForm({ ...form, recommendedStock: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional information..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSupply}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}