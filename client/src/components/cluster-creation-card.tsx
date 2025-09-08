import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertClusterRequestSchema, type InsertClusterRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { Server, Info, Rocket, Loader2, Database, Eye, CheckCircle } from "lucide-react";
import { FaMicrosoft } from "react-icons/fa";
import { Globe } from "lucide-react";
import DataViewModal from "./data-view-modal";

// MCP Server configuration
const MCP_SERVER_URL = 'http://localhost:3001';

export default function ClusterCreationCard() {
  const { toast } = useToast();
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningRequestId, setProvisioningRequestId] = useState<string>("");
  const [clusterName, setClusterName] = useState<string>("");
  const [isDataPopulated, setIsDataPopulated] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [clusterData, setClusterData] = useState<any>(null);
  const [isRestoringState, setIsRestoringState] = useState(false);
  const [isClusterCompleted, setIsClusterCompleted] = useState(false);
  const [dbConnectionString, setDbConnectionString] = useState('');
  const [dbName, setDbName] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [preference, setPreference] = useState<'regular' | 'timeseries' | 'clustered'>('regular');
  const [timeField, setTimeField] = useState('ts');
  const [metaField, setMetaField] = useState('meta');
  const [clusteredKey, setClusteredKey] = useState('email');
  

  const form = useForm<InsertClusterRequest>({
    resolver: zodResolver(insertClusterRequestSchema),
    defaultValues: {
      clusterName: "",
      tier: "M10",
    },
  });

  // Check for existing provisioning on component mount
  useEffect(() => {
    const savedRequestId = localStorage.getItem('atlas-cluster-request-id');
    const savedClusterName = localStorage.getItem('atlas-cluster-name');
    const savedTier = localStorage.getItem('atlas-cluster-tier');
    const savedDataPopulated = localStorage.getItem('atlas-data-populated') === 'true';
    
    if (savedRequestId && savedClusterName) {
      console.log('Restoring cluster state from localStorage:', { savedRequestId, savedClusterName });
      
      // Show restoration indicator
      setIsRestoringState(true);
      
      // Immediately restore the UI state to show progress bar
      setIsProvisioning(true);
      setProvisioningRequestId(savedRequestId);
      setClusterName(savedClusterName);
      setIsDataPopulated(savedDataPopulated);
      
      // Also restore the form values so the UI shows the correct tier
      if (savedTier) {
        form.setValue('tier', savedTier as any);
      }
      
      // Check if the MCP server actually has this cluster request
      const checkExistingStatus = async () => {
        try {
          const response = await fetch(`${MCP_SERVER_URL}/api/cluster-status?id=${savedRequestId}`);
          if (response.ok) {
            const status = await response.json();
            console.log('Retrieved cluster status from MCP server:', status);
            
            if (status.state === 'IDLE') {
              // Cluster completed successfully
              setIsProvisioning(false);
              setIsClusterCompleted(true);
              setProvisioningRequestId("");
              setClusterName("");
              setIsDataPopulated(false);
              setIsRestoringState(false);
              localStorage.removeItem('atlas-cluster-request-id');
              localStorage.removeItem('atlas-cluster-name');
              localStorage.removeItem('atlas-cluster-tier');
              localStorage.removeItem('atlas-data-populated');
              console.log('Cluster completed - cleared localStorage');
            } else if (status.state === 'CREATING' || status.state === 'INITIALIZING') {
              // Cluster is still being created - keep state restored
              console.log('Cluster still creating - maintaining UI state');
              setIsRestoringState(false); // Clear restoration indicator
              console.log('State restoration completed - progress bar should now be visible');
              setIsClusterCompleted(false); // Ensure not marked as completed
              // State is already restored above, just ensure it stays
            } else if (status.state === 'FAILED') {
              // Cluster creation failed - clear everything
              setIsProvisioning(false);
              setIsClusterCompleted(false);
              setProvisioningRequestId("");
              setClusterName("");
              setIsDataPopulated(false);
              setIsRestoringState(false);
              localStorage.removeItem('atlas-cluster-request-id');
              localStorage.removeItem('atlas-cluster-name');
              localStorage.removeItem('atlas-cluster-tier');
              localStorage.removeItem('atlas-data-populated');
              console.log('Cluster failed - cleared localStorage');
            }
          } else {
            // MCP server doesn't have this request (server was restarted)
            console.log('MCP server restarted - clearing orphaned cluster request');
            setIsProvisioning(false);
            setIsClusterCompleted(false);
            setProvisioningRequestId("");
            setClusterName("");
            setIsDataPopulated(false);
            setIsRestoringState(false);
            localStorage.removeItem('atlas-cluster-request-id');
            localStorage.removeItem('atlas-cluster-name');
            localStorage.removeItem('atlas-cluster-tier');
            localStorage.removeItem('atlas-data-populated');
          }
        } catch (error) {
          console.error('Failed to check existing cluster status:', error);
          // Network error or server unreachable - keep the UI state for now
          // Don't clear immediately, let the health check handle it
          console.log('Network error - keeping UI state for now');
        }
      };
      
      checkExistingStatus();
    } else {
      console.log('No saved cluster state found in localStorage');
    }
  }, []);

  // Add a periodic health check to detect server restarts during active provisioning
  useEffect(() => {
    if (!isProvisioning || !provisioningRequestId) return;

    const healthCheckInterval = setInterval(async () => {
      try {
        const response = await fetch(`${MCP_SERVER_URL}/api/cluster-status?id=${provisioningRequestId}`);
        if (!response.ok) {
          // Request not found - server was restarted
          console.log('Detected server restart during provisioning - clearing state');
          setIsProvisioning(false);
          setIsClusterCompleted(false);
          setProvisioningRequestId("");
          setClusterName("");
          setIsDataPopulated(false);
          setIsRestoringState(false);
          localStorage.removeItem('atlas-cluster-request-id');
          localStorage.removeItem('atlas-cluster-name');
          localStorage.removeItem('atlas-cluster-tier');
          localStorage.removeItem('atlas-data-populated');
          clearInterval(healthCheckInterval);
        }
      } catch (error) {
        // Network error - server might be down
        console.error('Health check failed:', error);
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(healthCheckInterval);
  }, [isProvisioning, provisioningRequestId]);

  // Query cluster status from MCP server
  const { data: clusterStatus, error: statusError } = useQuery({
    queryKey: ["cluster-status", provisioningRequestId],
    queryFn: async () => {
      if (!provisioningRequestId) return null;
      const response = await fetch(`${MCP_SERVER_URL}/api/cluster-status?id=${provisioningRequestId}`);
      if (!response.ok) throw new Error('Failed to fetch cluster status');
      return response.json();
    },
    refetchInterval: isProvisioning ? 5000 : false, // Poll every 5 seconds while provisioning
    enabled: !!provisioningRequestId && isProvisioning,
  });

  // Calculate progress based on cluster state and time
  const calculateProgress = () => {
    if (!isProvisioning) return 0;
    
    // If cluster is ready, show 100%
    if (clusterStatus?.state === 'IDLE') {
      return 100;
    }
    
    // If cluster is failed, show 0%
    if (clusterStatus?.state === 'FAILED') {
      return 0;
    }
    
    // If we have progress from MCP server, use it (10% to 90%)
    if (clusterStatus?.progress && clusterStatus.progress > 0) {
      return Math.min(clusterStatus.progress, 90); // Cap at 90% until IDLE
    }
    
    // Default progress for CREATING/INITIALIZING states
    return 10;
  };

  // Handle cluster completion
  useEffect(() => {
    if (clusterStatus?.state === 'IDLE' && isProvisioning) {
      console.log('Cluster creation completed - transitioning to completion state');
      setIsProvisioning(false);
      setIsClusterCompleted(true);
      
      // Keep localStorage so DatabaseCreationCard can use cluster context
      
      toast({
        title: "Cluster creation completed! 🎉",
        description: "Your MongoDB cluster is now ready for use. You can now populate and view data.",
      });
    }
  }, [clusterStatus, isProvisioning, toast]);

  // Removed auto-run DB flow to avoid triggering requests while typing.

  const provisionMutation = useMutation({
    mutationFn: async (data: InsertClusterRequest) => {
      console.log('Starting cluster creation with MCP server:', data);
      
      const response = await fetch(`${MCP_SERVER_URL}/create-cluster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterName: data.clusterName,
          tier: data.tier
        }),
      });
      
      console.log('MCP Server response status:', response.status);
      console.log('MCP Server response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        // Check if response is HTML (server error page)
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (contentType && contentType.includes('text/html')) {
          throw new Error('MCP Server is not running. Please start the server first.');
        }
        
        try {
          const errorData = await response.json();
          console.log('Error response:', errorData);
          throw new Error(errorData.message || 'Failed to create cluster');
        } catch (parseError) {
          console.error('Parse error:', parseError);
          throw new Error('MCP Server error - please check if MCP server is running');
        }
      }
      
      const result = await response.json();
      console.log('MCP Server success response:', result);
      
      return {
        requestId: result.requestId,
        status: "pending",
        message: "Cluster provisioning started via MCP Server",
        mcpResponse: result
      };
    },
    onSuccess: (data) => {
      console.log('Provisioning started successfully via MCP Server:', data);
      setProvisioningRequestId(data.requestId);
      setClusterName(form.getValues().clusterName);
      setIsProvisioning(true);
      setIsClusterCompleted(false); // Reset completion state
      
      // Save to localStorage for persistence across page refreshes
      localStorage.setItem('atlas-cluster-request-id', data.requestId);
      localStorage.setItem('atlas-cluster-name', form.getValues().clusterName);
      localStorage.setItem('atlas-cluster-tier', form.getValues().tier);
      localStorage.setItem('atlas-data-populated', 'false');
      
      toast({
        title: "Cluster provisioning started",
        description: `Your ${form.getValues().tier} cluster is now being provisioned via MCP Server.`,
      });
    },
    onError: (error) => {
      console.error('Provisioning failed:', error);
      toast({
        title: "Provisioning failed",
        description: error.message || "Failed to start cluster provisioning",
        variant: "destructive",
      });
    },
  });

  const populateDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${MCP_SERVER_URL}/api/populate-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, requestId: provisioningRequestId, connectionString: dbConnectionString, dbName, collectionName })
      });
      if (!response.ok) throw new Error('Failed to populate data');
      return response.json();
    },
    onSuccess: (data) => {
      setIsDataPopulated(true);
      localStorage.setItem('atlas-data-populated', 'true');
      
      toast({
        title: "Data populated successfully!",
        description: "Sample data has been added to your cluster via MCP Server.",
      });
    },
    onError: (error) => {
      toast({
        title: "Data population failed",
        description: error.message || "Failed to populate sample data",
        variant: "destructive",
      });
    },
  });

  const viewDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${MCP_SERVER_URL}/api/view-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, requestId: provisioningRequestId, connectionString: dbConnectionString, dbName, collectionName })
      });
      if (!response.ok) throw new Error('Failed to retrieve data');
      return response.json();
    },
    onSuccess: (data) => {
      setClusterData(data.data);
      setShowDataModal(true);
      
      toast({
        title: "Data retrieved successfully!",
        description: "Cluster data retrieved via MCP Server and displayed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Data retrieval failed",
        description: error.message || "Failed to retrieve cluster data",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertClusterRequest) => {
    provisionMutation.mutate(data);
  };

  return (
    <Card className="bg-white shadow-lg border border-gray-200 overflow-hidden">
      <CardContent className="p-8">
        {/* Card Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 bg-mongodb-green bg-opacity-10 rounded-lg flex items-center justify-center">
            <Server className="text-mongodb-green text-xl" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-text-primary">Cluster Creation Simplified</h3>
            <p className="text-text-secondary">Deploy a production-ready MongoDB cluster</p>
          </div>
          {/* MCP Server Status Badge */}
          {/* Removed MCP Server Status Badge */}
        </div>

        {/* MCP Server Status Indicator */}
        {/* Removed MCP Server Status Indicator */}

        {/* Cluster Tier Selection */}
        <div className="mb-6">
          <Label className="block text-sm font-semibold text-text-primary mb-3">
            Cluster Tier <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="relative">
              <input
                type="radio"
                id="small"
                name="clusterTier"
                value="M10"
                className="sr-only"
                disabled={isProvisioning}
                onChange={(e) => form.setValue('tier', e.target.value)}
                defaultChecked={form.watch('tier') === 'M10'}
              />
              <label
                htmlFor="small"
                className={`block p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 min-h-[140px] flex items-center justify-center ${
                  form.watch('tier') === 'M10'
                    ? 'border-mongodb-green bg-mongodb-green bg-opacity-10'
                    : 'border-gray-200 hover:border-gray-300'
                } ${isProvisioning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-center">
                  <div className="text-lg font-bold text-text-primary">Small</div>
                  <div className="text-sm text-text-secondary">M10 Tier</div>
                  <div className="text-xs text-text-secondary mt-2">2 vCPUs, 2GB RAM</div>
                </div>
              </label>
            </div>

            <div className="relative">
              <input
                type="radio"
                id="medium"
                name="clusterTier"
                value="M20"
                className="sr-only"
                disabled={isProvisioning}
                onChange={(e) => form.setValue('tier', e.target.value)}
                defaultChecked={form.watch('tier') === 'M20'}
              />
              <label
                htmlFor="medium"
                className={`block p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 min-h-[140px] flex items-center justify-center ${
                  form.watch('tier') === 'M20'
                    ? 'border-mongodb-green bg-mongodb-green bg-opacity-10'
                    : 'border-gray-200 hover:border-gray-300'
                } ${isProvisioning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-center">
                  <div className="text-lg font-bold text-text-primary">Medium</div>
                  <div className="text-sm text-text-secondary">M20 Tier</div>
                  <div className="text-xs text-text-secondary mt-2">4 vCPUs, 8GB RAM</div>
                </div>
              </label>
            </div>

            <div className="relative">
              <input
                type="radio"
                id="large"
                name="clusterTier"
                value="M30"
                className="sr-only"
                disabled={isProvisioning}
                onChange={(e) => form.setValue('tier', e.target.value)}
                defaultChecked={form.watch('tier') === 'M30'}
              />
              <label
                htmlFor="large"
                className={`block p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 min-h-[140px] flex items-center justify-center ${
                  form.watch('tier') === 'M30'
                    ? 'border-mongodb-green bg-mongodb-green bg-opacity-10'
                    : 'border-gray-200 hover:border-gray-300'
                } ${isProvisioning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-center">
                  <div className="text-lg font-bold text-text-primary">Large</div>
                  <div className="text-sm text-text-secondary">M30 Tier</div>
                  <div className="text-xs text-text-secondary mt-2">8 vCPUs, 16GB RAM</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Cluster Creation Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Cluster Name */}
            <FormField
              control={form.control}
              name="clusterName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-text-primary">
                    Cluster Name <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter cluster name (e.g., production-cluster)"
                      className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mongodb-green focus:border-mongodb-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isProvisioning}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-text-secondary">Must be 1-64 characters, letters, numbers, and hyphens only</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button with Progress Bar */}
            <div className="pt-4">
              {/* Progress Bar - Show only when provisioning */}
              {isProvisioning && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {/* State Restoration Indicator */}
                  {isRestoringState && (
                    <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
                      <div className="flex items-center justify-center space-x-2 text-blue-700 text-xs">
                        <Loader2 className="animate-spin w-3 h-3" />
                        <span>Restoring cluster state from previous session...</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-sm text-text-secondary mb-2">
                    <span className="font-medium">Creating Cluster...</span>
                    <span className="font-semibold text-mongodb-green">{Math.round(calculateProgress())}%</span>
                  </div>
                  <Progress 
                    value={calculateProgress()} 
                    className="w-full h-1.5 mb-2"
                  />
                  <p className="text-xs text-text-secondary text-center">
                    {clusterStatus?.statusMessage || "Initializing cluster creation..."}
                  </p>
                </div>
              )}
              
              <Button
                type="submit"
                disabled={provisionMutation.isPending || !form.watch('clusterName') || !form.watch('tier') || isProvisioning}
                className="w-full bg-mongodb-green hover:bg-mongodb-green hover:bg-opacity-90 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {provisionMutation.isPending ? (
                  <span className="flex items-center justify-center space-x-2">
                    <Loader2 className="animate-spin" />
                    <span>Creating...</span>
                  </span>
                ) : isProvisioning ? (
                  <span className="flex items-center justify-center space-x-2">
                    <Loader2 className="animate-spin" />
                    <span>Creating Cluster...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <Rocket />
                    <span>Create Cluster</span>
                  </span>
                )}
              </Button>
            </div>
          </form>
        </Form>

        {/* Database creation UI moved to DatabaseCreationCard; hide inline section */}
        {false && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-green-800">Cluster Creation Completed!</h3>
              <p className="text-sm text-green-600">Your MongoDB cluster is now ready for use.</p>
            </div>
            
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Connection String (mongodb+srv)</Label>
                  <Input placeholder="mongodb+srv://user:pass@cluster.mongodb.net/" value={dbConnectionString} onChange={(e) => setDbConnectionString(e.target.value)} />
                </div>
                <div>
                  <Label>Database Name</Label>
                  <Input placeholder="app" value={dbName} onChange={(e) => setDbName(e.target.value)} />
                </div>
                <div>
                  <Label>Collection Name</Label>
                  <Input placeholder="users" value={collectionName} onChange={(e) => setCollectionName(e.target.value)} />
                </div>
                <div>
                  <Label>Preference</Label>
                  <select className="w-full border rounded px-3 py-2" value={preference} onChange={(e) => setPreference(e.target.value as any)}>
                    <option value="regular">Regular</option>
                    <option value="timeseries">Time series</option>
                    <option value="clustered">Clustered index</option>
                  </select>
                </div>
                {preference === 'timeseries' && (
                  <>
                    <div>
                      <Label>timeField</Label>
                      <Input placeholder="ts" value={timeField} onChange={(e) => setTimeField(e.target.value)} />
                    </div>
                    <div>
                      <Label>metaField (optional)</Label>
                      <Input placeholder="meta" value={metaField} onChange={(e) => setMetaField(e.target.value)} />
                    </div>
                  </>
                )}
                {preference === 'clustered' && (
                  <div className="sm:col-span-2">
                    <Label>Clustered Index Key (field name)</Label>
                    <Input placeholder="email" value={clusteredKey} onChange={(e) => setClusteredKey(e.target.value)} />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Button
                    onClick={async () => {
                      if (!dbConnectionString || !dbName || !collectionName) return;
                      const payload: any = {
                        connectionString: dbConnectionString,
                        dbName,
                        collectionName,
                        preference,
                        requestId: provisioningRequestId,
                        clusterName
                      };
                      if (preference === 'timeseries') {
                        payload.timeField = timeField;
                        if (metaField) payload.metaField = metaField;
                      }
                      if (preference === 'clustered') {
                        payload.clusteredIndexKey = { [clusteredKey]: 1 };
                      }
                      const resp = await fetch(`${MCP_SERVER_URL}/api/create-database`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                      });
                      if (resp.ok) {
                        toast({ title: 'Database created', description: `${dbName}.${collectionName} created` });
                        // Chain: populate then view
                        try {
                          await populateDataMutation.mutateAsync();
                          await viewDataMutation.mutateAsync();
                        } catch {}
                      } else {
                        const msg = await resp.text();
                        toast({ title: 'Create database failed', description: msg, variant: 'destructive' });
                      }
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    Create Database & Collection (via MCP)
                  </Button>
                </div>
              </div>

              <Button
                onClick={() => populateDataMutation.mutate()}
                disabled={populateDataMutation.isPending || isDataPopulated || isProvisioning}
                className="w-full bg-mongodb-green hover:bg-mongodb-green hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
              >
                {populateDataMutation.isPending ? (
                  <span className="flex items-center justify-center space-x-2">
                    <Loader2 className="animate-spin" />
                    <span>Populating Data...</span>
                  </span>
                ) : isDataPopulated ? (
                  <span className="flex items-center justify-center space-x-2">
                    <CheckCircle />
                    <span>Data Populated ✓</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <Database />
                    <span>Populate Sample Data (via MCP)</span>
                  </span>
                )}
              </Button>

              <Button
                onClick={() => viewDataMutation.mutate()}
                disabled={viewDataMutation.isPending || !isDataPopulated || isProvisioning}
                variant="outline"
                className="w-full border border-gray-300 text-text-primary hover:bg-gray-50 font-semibold py-3 px-6 rounded-lg transition-all duration-200"
              >
                {viewDataMutation.isPending ? (
                  <span className="flex items-center justify-center space-x-2">
                    <Loader2 className="animate-spin" />
                    <span>Loading Data...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <Eye />
                    <span>View Data (via MCP)</span>
                  </span>
                )}
              </Button>

              <Button
                onClick={() => {
                  setClusterName("");
                  setProvisioningRequestId("");
                  setIsDataPopulated(false);
                  setShowDataModal(false);
                  setClusterData(null);
                  
                  // Clear localStorage
                  localStorage.removeItem('atlas-cluster-request-id');
                  localStorage.removeItem('atlas-cluster-name');
                  localStorage.removeItem('atlas-data-populated');
                }}
                variant="outline"
                className="w-full border border-gray-300 text-text-secondary hover:bg-gray-50 font-semibold py-3 px-6 rounded-lg transition-all duration-200"
              >
                Create Another Cluster
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      
      {/* Data View Modal */}
      {showDataModal && clusterData && (
        <DataViewModal
          isOpen={showDataModal}
          onClose={() => setShowDataModal(false)}
          clusterName={clusterName}
          data={clusterData}
        />
      )}
    </Card>
  );
}
