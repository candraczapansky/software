import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Save, X, BookOpen, Brain, RefreshCw, MessageSquare, Sparkles, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface KnowledgeEntry {
  id?: string;
  question: string;
  answer: string;
  category: string;
  keywords?: string[];
  isActive: boolean;
  priority?: number;
  usageCount?: number;
  lastUsed?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ResponseTemplate {
  id?: string;
  trigger: string;
  response: string;
  category: string;
  useAI: boolean;
  isActive: boolean;
}

const KnowledgeManagement: React.FC = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [testQuestion, setTestQuestion] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTestLoading, setIsTestLoading] = useState(false);

  const [formData, setFormData] = useState<KnowledgeEntry>({
    question: '',
    answer: '',
    category: 'general',
    keywords: [],
    isActive: true,
    priority: 1
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Predefined categories
  const categories = [
    { value: 'general', label: 'General Info' },
    { value: 'services', label: 'Services & Pricing' },
    { value: 'booking', label: 'Booking & Scheduling' },
    { value: 'policies', label: 'Policies' },
    { value: 'promotions', label: 'Promotions' },
    { value: 'location', label: 'Location & Hours' },
    { value: 'greetings', label: 'Greetings' },
    { value: 'custom', label: 'Custom' }
  ];

  // Fetch knowledge entries
  const { data: knowledgeEntries = [], isLoading, refetch } = useQuery({
    queryKey: ['knowledge-entries'],
    queryFn: async () => {
      const response = await fetch('/api/ai-knowledge');
      if (!response.ok) throw new Error('Failed to fetch knowledge entries');
      return response.json();
    }
  });

  // Add new knowledge entry
  const addKnowledgeMutation = useMutation({
    mutationFn: async (data: KnowledgeEntry) => {
      const response = await fetch('/api/ai-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to add knowledge entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({
        title: "Knowledge Added",
        description: "The AI will now use this response.",
      });
      // Sync with Python responder
      syncWithPythonResponder();
    },
    onError: (error) => {
      toast({
        title: "Add Failed",
        description: "Failed to add knowledge entry",
        variant: "destructive",
      });
    }
  });

  // Update knowledge entry
  const updateKnowledgeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: KnowledgeEntry }) => {
      const response = await fetch(`/api/ai-knowledge/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update knowledge entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      setEditingEntry(null);
      toast({
        title: "Knowledge Updated",
        description: "Changes have been saved.",
      });
      // Sync with Python responder
      syncWithPythonResponder();
    }
  });

  // Delete knowledge entry
  const deleteKnowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/ai-knowledge/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete knowledge entry');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      toast({
        title: "Knowledge Deleted",
        description: "Entry has been removed.",
      });
      // Sync with Python responder
      syncWithPythonResponder();
    }
  });

  // Sync with Python AI Responder
  const syncWithPythonResponder = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/ai-knowledge/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: knowledgeEntries })
      });
      
      if (response.ok) {
        toast({
          title: "Sync Complete",
          description: "AI responder has been updated with new knowledge.",
        });
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Could not sync with AI responder. Changes saved locally.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Test AI response
  const testAIResponse = async () => {
    if (!testQuestion.trim()) return;
    
    setIsTestLoading(true);
    try {
      const response = await fetch('/api/ai-knowledge/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: testQuestion })
      });
      
      const data = await response.json();
      setTestResponse(data.response || 'No response generated');
    } catch (error) {
      setTestResponse('Error: Could not get AI response');
      toast({
        title: "Test Failed",
        description: "Could not test AI response",
        variant: "destructive",
      });
    } finally {
      setIsTestLoading(false);
    }
  };

  // Export knowledge base
  const exportKnowledge = () => {
    const dataStr = JSON.stringify(knowledgeEntries, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `knowledge-base-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    toast({
      title: "Export Complete",
      description: "Knowledge base has been exported.",
    });
  };

  // Import knowledge base
  const importKnowledge = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        
        // Add imported entries
        for (const entry of imported) {
          await addKnowledgeMutation.mutateAsync(entry);
        }
        
        toast({
          title: "Import Complete",
          description: `Imported ${imported.length} knowledge entries.`,
        });
      } catch (error) {
        toast({
          title: "Import Failed",
          description: "Could not import knowledge base.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const resetForm = () => {
    setFormData({
      question: '',
      answer: '',
      category: 'general',
      keywords: [],
      isActive: true,
      priority: 1
    });
  };

  // Filter entries
  const filteredEntries = knowledgeEntries.filter((entry: KnowledgeEntry) => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      entry.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Common response templates
  const templates = [
    { trigger: "hours", response: "We're open Mon-Sat 9AM-7PM, Sun 10AM-5PM! 📅", category: "location" },
    { trigger: "parking", response: "Free parking right in front! Super convenient 🚗", category: "location" },
    { trigger: "gift card", response: "Gift certificates available for all services! Perfect for any occasion 🎁", category: "services" },
    { trigger: "first time", response: "New clients get 15% off their first Signature Head Spa! 🎆", category: "promotions" },
    { trigger: "cancel", response: "We require 24-hour notice for cancellations. Call us at (918) 727-7348", category: "policies" },
    { trigger: "membership", response: "We offer monthly packages! Buy 3 sessions and get 10% off! 🌟", category: "promotions" }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Knowledge Base
              </CardTitle>
              <CardDescription>
                Manage custom responses and knowledge for the AI responder
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={syncWithPythonResponder}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportKnowledge}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <label htmlFor="import-knowledge">
                <Button
                  variant="outline"
                  size="sm"
                  as="span"
                  className="cursor-pointer"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <input
                  id="import-knowledge"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={importKnowledge}
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="responses" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="responses">Custom Responses</TabsTrigger>
              <TabsTrigger value="templates">Quick Templates</TabsTrigger>
              <TabsTrigger value="test">Test AI</TabsTrigger>
            </TabsList>

            <TabsContent value="responses" className="space-y-4">
              {/* Search and Filter Bar */}
              <div className="flex gap-4">
                <Input
                  placeholder="Search knowledge..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Knowledge
                </Button>
              </div>

              {/* Knowledge Entries List */}
              <div className="grid gap-4">
                {filteredEntries.map((entry: KnowledgeEntry) => (
                  <Card key={entry.id} className={!entry.isActive ? 'opacity-60' : ''}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{entry.question}</span>
                            <Badge variant={entry.isActive ? "default" : "secondary"}>
                              {entry.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">{entry.category}</Badge>
                            {entry.usageCount && (
                              <Badge variant="outline">
                                Used {entry.usageCount} times
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 pl-6">
                            {entry.answer}
                          </div>
                          {entry.keywords && entry.keywords.length > 0 && (
                            <div className="flex gap-1 pl-6">
                              {entry.keywords.map((keyword, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingEntry(entry)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => entry.id && deleteKnowledgeMutation.mutate(entry.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="space-y-4">
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  Quick templates for common customer questions. Click to add them to your knowledge base.
                </AlertDescription>
              </Alert>
              
              <div className="grid gap-3">
                {templates.map((template, idx) => (
                  <Card key={idx} className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setFormData({
                        question: `Questions about ${template.trigger}`,
                        answer: template.response,
                        category: template.category,
                        keywords: [template.trigger],
                        isActive: true,
                        priority: 1
                      });
                      setIsAddDialogOpen(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{template.category}</Badge>
                            <span className="text-sm font-medium">Trigger: "{template.trigger}"</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {template.response}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="test" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Test AI Responses</CardTitle>
                  <CardDescription>
                    Test how the AI will respond to customer messages
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer Message</Label>
                    <Textarea
                      placeholder="Type a customer message to test... e.g., 'What are your hours?'"
                      value={testQuestion}
                      onChange={(e) => setTestQuestion(e.target.value)}
                      rows={3}
                    />
                  </div>
                  
                  <Button 
                    onClick={testAIResponse} 
                    disabled={isTestLoading || !testQuestion.trim()}
                    className="w-full"
                  >
                    {isTestLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Generate AI Response
                  </Button>
                  
                  {testResponse && (
                    <Card className="bg-gray-50 dark:bg-gray-800">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <Brain className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium mb-1">AI Response:</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {testResponse}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isAddDialogOpen || !!editingEntry} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setEditingEntry(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? 'Edit Knowledge' : 'Add Knowledge'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question / Trigger</Label>
              <Input
                placeholder="e.g., 'What are your hours?' or 'parking'"
                value={editingEntry ? editingEntry.question : formData.question}
                onChange={(e) => {
                  if (editingEntry) {
                    setEditingEntry({ ...editingEntry, question: e.target.value });
                  } else {
                    setFormData({ ...formData, question: e.target.value });
                  }
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Answer / Response</Label>
              <Textarea
                placeholder="The response the AI should give..."
                value={editingEntry ? editingEntry.answer : formData.answer}
                onChange={(e) => {
                  if (editingEntry) {
                    setEditingEntry({ ...editingEntry, answer: e.target.value });
                  } else {
                    setFormData({ ...formData, answer: e.target.value });
                  }
                }}
                rows={4}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select 
                  value={editingEntry ? editingEntry.category : formData.category}
                  onValueChange={(value) => {
                    if (editingEntry) {
                      setEditingEntry({ ...editingEntry, category: value });
                    } else {
                      setFormData({ ...formData, category: value });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Keywords (comma-separated)</Label>
                <Input
                  placeholder="e.g., hours, open, schedule"
                  value={(editingEntry ? editingEntry.keywords : formData.keywords)?.join(', ') || ''}
                  onChange={(e) => {
                    const keywords = e.target.value.split(',').map(k => k.trim()).filter(k => k);
                    if (editingEntry) {
                      setEditingEntry({ ...editingEntry, keywords });
                    } else {
                      setFormData({ ...formData, keywords });
                    }
                  }}
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="active"
                checked={editingEntry ? editingEntry.isActive : formData.isActive}
                onCheckedChange={(checked) => {
                  if (editingEntry) {
                    setEditingEntry({ ...editingEntry, isActive: checked });
                  } else {
                    setFormData({ ...formData, isActive: checked });
                  }
                }}
              />
              <Label htmlFor="active">Active (AI will use this response)</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddDialogOpen(false);
              setEditingEntry(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (editingEntry && editingEntry.id) {
                updateKnowledgeMutation.mutate({ id: editingEntry.id, data: editingEntry });
              } else {
                addKnowledgeMutation.mutate(formData);
              }
            }}>
              {editingEntry ? 'Update' : 'Add'} Knowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeManagement;



