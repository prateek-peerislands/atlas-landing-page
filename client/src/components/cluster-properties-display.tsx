import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw } from 'lucide-react';

interface ClusterPropertiesDisplayProps {
  availableClusters: any[];
}

export default function ClusterPropertiesDisplay({ availableClusters }: ClusterPropertiesDisplayProps) {
  const [selectedClusterName, setSelectedClusterName] = useState('');
  const [clusterProperties, setClusterProperties] = useState<any>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClusterProperties = async () => {
    if (!selectedClusterName) {
      setError('Please select a cluster first');
      return;
    }

    setLoadingProperties(true);
    setError(null);
    setClusterProperties(null);

    try {
      console.log('🔍 [CLUSTER-PROPERTIES] Fetching properties for cluster:', selectedClusterName);
      const response = await fetch(`http://localhost:3001/api/cluster-properties?clusterName=${encodeURIComponent(selectedClusterName)}`);
      const data = await response.json();

      console.log('🔍 [CLUSTER-PROPERTIES] Full API response:', data);

      if (data.success) {
        setClusterProperties(data.cluster);
        console.log('✅ [CLUSTER-PROPERTIES] Fetched cluster properties:', data.cluster);
      } else {
        console.error('❌ [CLUSTER-PROPERTIES] API error:', data.message);
        setError(data.message || 'Failed to fetch cluster properties');
      }
    } catch (error) {
      console.error('❌ [CLUSTER-PROPERTIES] Network error:', error);
      setError('Failed to fetch cluster properties');
    } finally {
      setLoadingProperties(false);
    }
  };

  return (
    <Card className="bg-white shadow-lg border border-gray-200 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <RefreshCw className="w-6 h-6 text-green-600" />
          Cluster Properties
        </CardTitle>
        <p className="text-sm text-gray-600">Fetch detailed information about your MongoDB Atlas clusters.</p>
      </CardHeader>
      <CardContent className="p-8">
        {/* Cluster Selection */}
        <div className="grid gap-4 sm:grid-cols-2 items-end mb-8">
          <div className="space-y-2">
            <Label htmlFor="cluster-select">Select Cluster</Label>
            <Select value={selectedClusterName} onValueChange={setSelectedClusterName}>
              <SelectTrigger id="cluster-select">
                <SelectValue placeholder="Choose a cluster..." />
              </SelectTrigger>
              <SelectContent>
                {availableClusters && availableClusters.length > 0 ? (
                  (() => {
                    // Filter clusters to only show those in IDLE state
                    const idleClusters = availableClusters.filter(cluster => 
                      cluster.state === 'IDLE' || cluster.state === 'idle'
                    );
                    
                    if (idleClusters.length === 0) {
                      return (
                        <SelectItem value="no-idle-clusters" disabled>
                          No clusters in IDLE state available
                        </SelectItem>
                      );
                    }
                    
                    return idleClusters.map((cluster) => (
                      <SelectItem key={cluster.id} value={cluster.name}>
                        {cluster.name} ({cluster.tier}) - {cluster.hasConnectionString ? 'Ready' : 'No connection string'}
                      </SelectItem>
                    ));
                  })()
                ) : (
                  <SelectItem value="no-clusters" disabled>
                    No clusters available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={fetchClusterProperties} 
            disabled={!selectedClusterName || loadingProperties}
            className="w-full sm:w-auto"
          >
            {loadingProperties ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Fetch Properties
              </>
            )}
          </Button>
        </div>

        {/* Loading State */}
        {loadingProperties && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
              <p className="text-gray-600">Fetching cluster properties...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* No Selection State */}
        {!selectedClusterName && !loadingProperties && !error && (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Select a cluster above to view its properties</p>
          </div>
        )}

        {/* Cluster Properties Display - Clean & Simple */}
        {clusterProperties && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Properties of the cluster</h3>
            
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">SKU:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.sku || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Size:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.tier || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">CPU:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.cpu || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">RAM:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.ram || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Storage:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.storage || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Provider:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.cloudProvider || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">Region:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.region || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-600">State:</span>
                  <span className="text-sm font-semibold text-gray-900">{clusterProperties.state || 'Unknown'}</span>
                </div>
              </div>

              {/* Security Information */}
              <div className="mt-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Security Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-600">TLS/SSL Encryption:</span>
                    <span className={`text-sm font-semibold ${clusterProperties.tlsEncryption ? 'text-green-600' : 'text-red-600'}`}>
                      {clusterProperties.tlsEncryption ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-600">Database Auditing:</span>
                    <span className={`text-sm font-semibold ${clusterProperties.databaseAuditing ? 'text-green-600' : 'text-red-600'}`}>
                      {clusterProperties.databaseAuditing ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-600">Encryption at Rest:</span>
                    <span className={`text-sm font-semibold ${clusterProperties.dataEncryptionAtRest ? 'text-green-600' : 'text-red-600'}`}>
                      {clusterProperties.dataEncryptionAtRest ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-600">Retry Writes:</span>
                    <span className={`text-sm font-semibold ${clusterProperties.retryWrites ? 'text-green-600' : 'text-red-600'}`}>
                      {clusterProperties.retryWrites ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}