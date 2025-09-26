import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const MCP_SERVER_URL = 'http://localhost:3001';

// Get connection string from cluster request - let MCP server handle all connection string generation
const getConnectionString = async (clusterName: string, dbName: string, requestId?: string): Promise<string | null> => {
  // If we have a requestId, try to get the real connection string from the cluster request
  if (requestId) {
    try {
      const response = await fetch(`${MCP_SERVER_URL}/api/cluster-status?id=${requestId}`);
      if (response.ok) {
        const clusterData = await response.json();
        if (clusterData.mongoClusterUri) {
          // Use the real connection string from Atlas and append the database name
          return `${clusterData.mongoClusterUri}${dbName}`;
        }
      }
    } catch (error) {
      console.warn('Failed to get cluster connection string:', error);
    }
  }
  
  // Return null to let MCP server handle connection string generation
  // The MCP server has sophisticated fallback logic and environment variable access
  return null;
};

interface DatabaseCreationCardProps {
  clusterName?: string;
  clusterRequestId?: string;
}

export default function DatabaseCreationCard({ clusterName: propClusterName, clusterRequestId }: DatabaseCreationCardProps) {
  const { toast } = useToast();
  const [clusterName, setClusterName] = useState(propClusterName || '');
  // Connection string will be auto-generated
  const [dbName, setDbName] = useState('');
  const [collectionName, setCollectionName] = useState('users'); // Auto-fill since only 'users' is supported
  const [preference, setPreference] = useState<'regular' | 'timeseries' | 'clustered'>('regular');
  const [timeField, setTimeField] = useState('ts');
  const [metaField, setMetaField] = useState('');
  const [clusteredKey, setClusteredKey] = useState('email');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [populated, setPopulated] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [clusterData, setClusterData] = useState<any>(null);
  const [availableClusters, setAvailableClusters] = useState<any[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState('');

  // Fetch available clusters on component mount
  useEffect(() => {
    fetchAvailableClusters();
  }, []);

  // When clusterName prop changes, try to find the corresponding cluster ID
  useEffect(() => {
    if (propClusterName && availableClusters.length > 0) {
      const matchingCluster = availableClusters.find(c => c.name === propClusterName);
      if (matchingCluster) {
        setSelectedClusterId(matchingCluster.id);
      }
    }
  }, [propClusterName, availableClusters]);

  const fetchAvailableClusters = async () => {
    try {
      setLoadingClusters(true);
      // Fetch clusters directly from Atlas API
      const response = await fetch(`${MCP_SERVER_URL}/api/atlas-clusters`);
      if (response.ok) {
        const data = await response.json();
        setAvailableClusters(data.clusters || []);
      } else {
        // Fallback to server endpoint
        const fallbackResponse = await fetch(`${MCP_SERVER_URL}/api/clusters`);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          setAvailableClusters(fallbackData.clusters || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch clusters:', error);
    } finally {
      setLoadingClusters(false);
    }
  };

  const onCreate = async () => {
    try {
      setCreating(true);
      
      // Get connection string from cluster request (if available)
      const connectionString = await getConnectionString(clusterName, dbName, clusterRequestId || selectedClusterId);
      
      const payload: any = {
        dbName,
        collectionName,
        preference,
        clusterName,
        requestId: clusterRequestId || selectedClusterId
      };
      
      // Only include connectionString if we have one from cluster request
      // Otherwise, let MCP server handle connection string generation
      if (connectionString) {
        payload.connectionString = connectionString;
      }
      if (preference === 'timeseries') {
        payload.timeField = timeField || 'ts';
        if (metaField) payload.metaField = metaField;
      }
      if (preference === 'clustered') {
        payload.clusteredIndexKey = { [clusteredKey || '_id']: 1 };
      }
      const resp = await fetch(`${MCP_SERVER_URL}/api/create-database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const msgText = await resp.text();
      if (!resp.ok) {
        toast({ title: 'Create database failed', description: msgText, variant: 'destructive' });
        return;
      }
      toast({ title: 'Database created', description: msgText });
      setCreated(true);
    } catch (e: any) {
      toast({ title: 'Create database failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const getRequestContext = () => {
    const requestId = localStorage.getItem('atlas-cluster-request-id') || '';
    const savedClusterName = localStorage.getItem('atlas-cluster-name') || clusterName;
    return { requestId, clusterName: savedClusterName };
  };

  const onPopulate = async () => {
    try {
      setPopulating(true);
      
      // Use the selected cluster from dropdown or props
      if (!clusterName) {
        toast({ title: 'Missing cluster context', description: 'Please select a cluster from the dropdown.', variant: 'destructive' });
        return;
      }
      
      // If we have a clusterRequestId from props, use that; otherwise use selectedClusterId
      const requestId = clusterRequestId || selectedClusterId;
      
      // Get connection string from cluster request (if available)
      const connectionString = await getConnectionString(clusterName, dbName, clusterRequestId || selectedClusterId);
      
      const payload: any = { 
        dbName,
        clusterName
      };
      
      // Only include requestId if we have one
      if (requestId) {
        payload.requestId = requestId;
      }
      
      // Only include connectionString if we have one from cluster request
      if (connectionString) {
        payload.connectionString = connectionString;
      }
      const resp = await fetch(`${MCP_SERVER_URL}/api/populate-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await resp.json();
      if (!resp.ok || json.success === false) {
        toast({ title: 'Populate failed', description: json.error || json.message || 'Failed to populate', variant: 'destructive' });
        return;
      }
      toast({ title: 'Data populated', description: `Collections: ${(json.collections || []).join(', ')}` });
      setPopulated(true);
    } catch (e: any) {
      toast({ title: 'Populate failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setPopulating(false);
    }
  };

  const onView = async () => {
    try {
      setViewing(true);
      setClusterData(null);
      
      // Use the selected cluster from dropdown or props
      if (!clusterName) {
        toast({ title: 'Missing cluster context', description: 'Please select a cluster from the dropdown.', variant: 'destructive' });
        return;
      }
      
      // If we have a clusterRequestId from props, use that; otherwise use selectedClusterId
      const requestId = clusterRequestId || selectedClusterId;
      
      // Get connection string from cluster request (if available)
      const connectionString = await getConnectionString(clusterName, dbName, clusterRequestId || selectedClusterId);
      
      const payload: any = { 
        dbName,
        clusterName
      };
      
      // Only include requestId if we have one
      if (requestId) {
        payload.requestId = requestId;
      }
      
      // Only include connectionString if we have one from cluster request
      if (connectionString) {
        payload.connectionString = connectionString;
      }
      const resp = await fetch(`${MCP_SERVER_URL}/api/view-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await resp.json();
      if (!resp.ok || json.success === false) {
        toast({ title: 'View failed', description: json.error || json.message || 'Failed to view data', variant: 'destructive' });
        return;
      }
      setClusterData(json.data);
      toast({ title: 'Data retrieved', description: 'Showing up to 2 docs from each collection.' });
    } catch (e: any) {
      toast({ title: 'View failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setViewing(false);
    }
  };

  return (
    <Card className="bg-white shadow-lg border border-gray-200 overflow-hidden mt-8">
      <CardContent className="p-8">
        <h3 className="text-2xl font-bold mb-2">Database Creation</h3>
        <p className="text-sm text-gray-600 mb-6">Create a database and an initial collection in your MongoDB Atlas cluster via MCP.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Select Cluster</Label>
            <div className="flex gap-2">
              <select 
                className="flex-1 border rounded px-3 py-2" 
                value={clusterName} 
                onChange={(e) => {
                  const selectedCluster = availableClusters.find(c => c.name === e.target.value);
                  setClusterName(e.target.value);
                  setSelectedClusterId(selectedCluster?.id || '');
                }}
                disabled={loadingClusters}
              >
                <option value="">Select a cluster...</option>
                {availableClusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.name}>
                    {cluster.name} ({cluster.tier}) - {cluster.hasConnectionString ? 'Ready' : 'No connection string'}
                  </option>
                ))}
              </select>
              <Button 
                type="button" 
                variant="outline" 
                onClick={fetchAvailableClusters}
                disabled={loadingClusters}
                className="px-3"
              >
                {loadingClusters ? '...' : '↻'}
              </Button>
            </div>
            {availableClusters.length === 0 && !loadingClusters && (
              <p className="text-xs text-gray-500 mt-1">No completed clusters found. Create a cluster first.</p>
            )}
          </div>
          
          {!created && (
          <>
          {/* Connection string is auto-generated */}
          <div>
            <Label>Database Name</Label>
            <Input placeholder="app" value={dbName} onChange={(e) => setDbName(e.target.value)} />
          </div>
          <div>
            <Label>Collection Name</Label>
            <Input 
              placeholder="users" 
              value={collectionName} 
              onChange={(e) => setCollectionName(e.target.value)}
              disabled
              className="bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Only "users" collection is supported</p>
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
              <Label>Clustered Index Key (field)</Label>
              <Input placeholder="email" value={clusteredKey} onChange={(e) => setClusteredKey(e.target.value)} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button onClick={onCreate} disabled={creating || !clusterName || !dbName} className="w-full">
              {creating ? 'Creating…' : 'Create Database & Collection'}
            </Button>
          </div>
          </>
          )}
        </div>

        {created && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Connection string is auto-generated */}
              <div>
                <Label>Database Name</Label>
                <Input placeholder="app" value={dbName} onChange={(e) => setDbName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {!populated && (
                <Button onClick={onPopulate} disabled={populating || !dbName} className="w-full">{populating ? 'Populating…' : 'Populate Data'}</Button>
              )}
              {populated && (
                <Button variant="outline" onClick={onView} disabled={viewing || !dbName} className="w-full">{viewing ? 'Loading…' : 'View Data'}</Button>
              )}
            </div>

            {clusterData && (
              <div className="mt-4 p-3 border rounded bg-gray-50 text-xs whitespace-pre-wrap">
                <pre>{JSON.stringify(clusterData, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


