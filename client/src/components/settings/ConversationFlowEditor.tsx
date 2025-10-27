import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Play,
  ChevronRight
} from 'lucide-react';

interface FlowBranch {
  keywords: string[];
  response?: string;
  nextNodeId?: number;
}

interface ConversationFlow {
  id?: number;
  name: string;
  nodeType: 'greeting' | 'question' | 'response' | 'end';
  message: string;
  parentId?: number | null;
  branches?: FlowBranch[];
  isActive: boolean;
  isRoot: boolean;
  timeout: number;
  speechTimeout: number;
  orderIndex: number;
}

export default function ConversationFlowEditor() {
  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<ConversationFlow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/voice-conversation-flows', {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch flows');
      
      const data = await response.json();
      setFlows(data);
    } catch (err) {
      setError('Failed to load conversation flows');
      console.error('Error fetching flows:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFlow = async () => {
    if (!selectedFlow) return;

    try {
      setLoading(true);
      const method = selectedFlow.id ? 'PUT' : 'POST';
      const url = selectedFlow.id 
        ? `/api/voice-conversation-flows/${selectedFlow.id}`
        : '/api/voice-conversation-flows';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(selectedFlow)
      });

      if (!response.ok) throw new Error('Failed to save flow');
      
      setSuccess('Flow saved successfully');
      await fetchFlows();
      setEditMode(false);
    } catch (err) {
      setError('Failed to save flow');
      console.error('Error saving flow:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFlow = async (id: number) => {
    if (!confirm('Are you sure you want to delete this flow?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/voice-conversation-flows/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to delete flow');
      
      setSuccess('Flow deleted successfully');
      await fetchFlows();
      if (selectedFlow?.id === id) {
        setSelectedFlow(null);
      }
    } catch (err) {
      setError('Failed to delete flow');
      console.error('Error deleting flow:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestFlow = async () => {
    try {
      const response = await fetch('/api/voice-conversation-flows/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          input: testInput,
          nodeId: selectedFlow?.id
        })
      });

      if (!response.ok) throw new Error('Failed to test flow');
      
      const result = await response.json();
      setTestResult(result);
    } catch (err) {
      setError('Failed to test flow');
      console.error('Error testing flow:', err);
    }
  };

  const handleAddBranch = () => {
    if (!selectedFlow) return;
    
    const newBranch: FlowBranch = {
      keywords: [],
      response: '',
      nextNodeId: undefined
    };
    
    setSelectedFlow({
      ...selectedFlow,
      branches: [...(selectedFlow.branches || []), newBranch]
    });
  };

  const handleUpdateBranch = (index: number, branch: FlowBranch) => {
    if (!selectedFlow) return;
    
    const branches = [...(selectedFlow.branches || [])];
    branches[index] = branch;
    
    setSelectedFlow({
      ...selectedFlow,
      branches
    });
  };

  const handleRemoveBranch = (index: number) => {
    if (!selectedFlow) return;
    
    const branches = [...(selectedFlow.branches || [])];
    branches.splice(index, 1);
    
    setSelectedFlow({
      ...selectedFlow,
      branches
    });
  };

  const createNewFlow = () => {
    setSelectedFlow({
      name: 'New Flow Node',
      nodeType: 'response',
      message: '',
      isActive: true,
      isRoot: false,
      timeout: 10,
      speechTimeout: 3,
      orderIndex: flows.length,
      branches: []
    });
    setEditMode(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">AI Voice Responder - Conversation Flows</h2>
        <Button
          onClick={createNewFlow}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create New Flow
        </Button>
      </div>

      {error && (
        <Alert className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="mb-4">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Flow List */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Flow Nodes</CardTitle>
              <p className="text-sm text-muted-foreground">Manage your AI conversation flows</p>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="divide-y">
                {flows.map((flow) => (
                  <div
                    key={flow.id}
                    className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                      selectedFlow?.id === flow.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => {
                      setSelectedFlow(flow);
                      setEditMode(false);
                      setTestResult(null);
                    }}
                  >
                    <div className="font-medium">{flow.name}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {flow.nodeType}
                      </Badge>
                      {flow.isRoot && (
                        <Badge variant="secondary" className="text-xs">
                          ROOT
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                
                {flows.length === 0 && (
                  <div className="p-4">
                    <div className="text-sm">No flows created yet</div>
                    <div className="text-xs text-muted-foreground">Click 'Create New Flow' to get started</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flow Editor */}
        <div className="md:col-span-2">
          {selectedFlow ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{editMode ? 'Edit' : 'View'} Flow Node</CardTitle>
                <div className="flex gap-2">
                  {!editMode ? (
                    <Button
                      onClick={() => setEditMode(true)}
                      disabled={loading}
                      size="sm"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={handleSaveFlow}
                        disabled={loading}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button
                        onClick={() => {
                          setEditMode(false);
                          if (!selectedFlow.id) {
                            setSelectedFlow(null);
                          }
                        }}
                        variant="outline"
                        disabled={loading}
                        size="sm"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      {selectedFlow.id && (
                        <Button
                          onClick={() => handleDeleteFlow(selectedFlow.id!)}
                          variant="destructive"
                          disabled={loading}
                          size="sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>
              <Separator />
              
              <CardContent className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="node-name">Node Name</Label>
                    <Input
                      id="node-name"
                      value={selectedFlow.name}
                      onChange={(e) => setSelectedFlow({ ...selectedFlow, name: e.target.value })}
                      disabled={!editMode}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="node-type">Node Type</Label>
                    <Select
                      value={selectedFlow.nodeType}
                      onValueChange={(value) => setSelectedFlow({ 
                        ...selectedFlow, 
                        nodeType: value as ConversationFlow['nodeType'] 
                      })}
                      disabled={!editMode}
                    >
                      <SelectTrigger id="node-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="greeting">Greeting</SelectItem>
                        <SelectItem value="question">Question</SelectItem>
                        <SelectItem value="response">Response</SelectItem>
                        <SelectItem value="end">End</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (seconds)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      value={selectedFlow.timeout}
                      onChange={(e) => setSelectedFlow({ 
                        ...selectedFlow, 
                        timeout: parseInt(e.target.value) || 10 
                      })}
                      disabled={!editMode}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="speech-timeout">Speech Timeout (seconds)</Label>
                    <Input
                      id="speech-timeout"
                      type="number"
                      value={selectedFlow.speechTimeout}
                      onChange={(e) => setSelectedFlow({ 
                        ...selectedFlow, 
                        speechTimeout: parseInt(e.target.value) || 3 
                      })}
                      disabled={!editMode}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={selectedFlow.message}
                    onChange={(e) => setSelectedFlow({ ...selectedFlow, message: e.target.value })}
                    disabled={!editMode}
                    rows={4}
                    className="resize-none"
                  />
                </div>
                
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is-active"
                      checked={selectedFlow.isActive}
                      onCheckedChange={(checked) => setSelectedFlow({ 
                        ...selectedFlow, 
                        isActive: checked 
                      })}
                      disabled={!editMode}
                    />
                    <Label htmlFor="is-active">Active</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is-root"
                      checked={selectedFlow.isRoot}
                      onCheckedChange={(checked) => setSelectedFlow({ 
                        ...selectedFlow, 
                        isRoot: checked 
                      })}
                      disabled={!editMode}
                    />
                    <Label htmlFor="is-root">Root Node</Label>
                  </div>
                </div>

                {/* Branches Section */}
                {selectedFlow.nodeType === 'question' && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="font-semibold">Response Branches</h4>
                        {editMode && (
                          <Button
                            onClick={handleAddBranch}
                            size="sm"
                            variant="outline"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Branch
                          </Button>
                        )}
                      </div>
                      
                      {selectedFlow.branches?.map((branch, index) => (
                        <Card key={index}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div className="font-medium">Branch {index + 1}</div>
                              {editMode && (
                                <Button
                                  onClick={() => handleRemoveBranch(index)}
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Keywords (comma-separated)</Label>
                              <Input
                                value={branch.keywords.join(', ')}
                                onChange={(e) => {
                                  const keywords = e.target.value
                                    .split(',')
                                    .map(k => k.trim())
                                    .filter(k => k);
                                  handleUpdateBranch(index, { ...branch, keywords });
                                }}
                                placeholder="yes, confirm, ok"
                                disabled={!editMode}
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Response</Label>
                              <Textarea
                                value={branch.response || ''}
                                onChange={(e) => handleUpdateBranch(index, { 
                                  ...branch, 
                                  response: e.target.value 
                                })}
                                disabled={!editMode}
                                rows={2}
                                className="resize-none"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Next Node</Label>
                              <Select
                                value={branch.nextNodeId?.toString() || ''}
                                onValueChange={(value) => handleUpdateBranch(index, { 
                                  ...branch, 
                                  nextNodeId: value ? parseInt(value) : undefined 
                                })}
                                disabled={!editMode}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select next node" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">None</SelectItem>
                                  {flows
                                    .filter(f => f.id && f.id !== selectedFlow.id)
                                    .map(flow => (
                                      <SelectItem key={flow.id} value={flow.id!.toString()}>
                                        {flow.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {/* Test Section */}
                {selectedFlow.id && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="font-semibold">Test Flow</h4>
                      <div className="flex gap-2">
                        <Input
                          value={testInput}
                          onChange={(e) => setTestInput(e.target.value)}
                          placeholder="Enter test input..."
                        />
                        <Button
                          onClick={handleTestFlow}
                          disabled={!testInput}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Test
                        </Button>
                      </div>
                      
                      {testResult && (
                        <Card className="bg-muted">
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div>
                                <span className="font-semibold">Response:</span>
                                <p className="mt-1">{testResult.response}</p>
                              </div>
                              {testResult.nextNode && (
                                <div>
                                  <span className="font-semibold">Next Node:</span>
                                  <p className="mt-1">{testResult.nextNode}</p>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Select a flow from the list or create a new one</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}