import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const MCP_SERVER_URL = 'http://localhost:3001';

export default function DatabaseCreationCard() {
  const { toast } = useToast();
  const [clusterName, setClusterName] = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [dbName, setDbName] = useState('');
  const [collectionName, setCollectionName] = useState('');
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

  const onCreate = async () => {
    try {
      setCreating(true);
      const payload: any = {
        connectionString,
        dbName,
        collectionName,
        preference
      };
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
      const { requestId, clusterName: name } = getRequestContext();
      const payload: any = { connectionString, dbName };
      if (!connectionString) {
        if (!requestId || !name) {
          toast({ title: 'Missing connection/cluster context', description: 'Provide a connection string and database name, or restore the page that created the cluster.', variant: 'destructive' });
          return;
        }
        payload.clusterName = name;
        payload.requestId = requestId;
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
      const { requestId, clusterName: name } = getRequestContext();
      const payload: any = { connectionString, dbName };
      if (!connectionString) {
        if (!requestId || !name) {
          toast({ title: 'Missing connection/cluster context', description: 'Provide a connection string and database name, or restore the page that created the cluster.', variant: 'destructive' });
          return;
        }
        payload.clusterName = name;
        payload.requestId = requestId;
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
      toast({ title: 'Data retrieved', description: 'Showing up to 5 docs from each collection.' });
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

        {!created && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Cluster Name (optional)</Label>
            <Input placeholder="my-cluster" value={clusterName} onChange={(e) => setClusterName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Connection String (mongodb+srv)</Label>
            <Input placeholder="mongodb+srv://user:pass@cluster.mongodb.net/" value={connectionString} onChange={(e) => setConnectionString(e.target.value)} />
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
              <Label>Clustered Index Key (field)</Label>
              <Input placeholder="email" value={clusteredKey} onChange={(e) => setClusteredKey(e.target.value)} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button onClick={onCreate} disabled={creating || !connectionString || !dbName || !collectionName} className="w-full">
              {creating ? 'Creating…' : 'Create Database & Collection (via MCP)'}
            </Button>
          </div>
        </div>
        )}

        {created && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Connection String (mongodb+srv)</Label>
                <Input placeholder="mongodb+srv://user:pass@cluster.mongodb.net/" value={connectionString} onChange={(e) => setConnectionString(e.target.value)} />
              </div>
              <div>
                <Label>Database Name</Label>
                <Input placeholder="app" value={dbName} onChange={(e) => setDbName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {!populated && (
                <Button onClick={onPopulate} disabled={populating || !dbName} className="w-full">{populating ? 'Populating…' : 'Populate Data (via MCP)'}</Button>
              )}
              <Button variant="outline" onClick={onView} disabled={viewing || !dbName} className="w-full">{viewing ? 'Loading…' : 'View Data (via MCP)'}</Button>
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


