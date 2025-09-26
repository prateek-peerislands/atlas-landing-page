import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Database, Cpu, HardDrive, Shield, Zap } from 'lucide-react';

interface CurrentClusterDetailsProps {
  clusterName: string;
  clusterTier: string;
  clusterId?: string;
  connectionString?: string;
  auditingEnabled?: boolean;
  auditingStatus?: string;
  auditingMessage?: string;
}

export default function CurrentClusterDetails({ 
  clusterName, 
  clusterTier, 
  clusterId,
  connectionString,
  auditingEnabled,
  auditingStatus,
  auditingMessage 
}: CurrentClusterDetailsProps) {
  const [clusterProperties, setClusterProperties] = useState<any>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClusterProperties = async () => {
    if (!clusterName) {
      setError('Cluster name is required');
      return;
    }

    setLoadingProperties(true);
    setError(null);
    setClusterProperties(null);

    try {
      console.log('🔍 [CURRENT-CLUSTER] Fetching properties for cluster:', clusterName);
      const response = await fetch(`http://localhost:3001/api/cluster-properties?clusterName=${encodeURIComponent(clusterName)}`);
      const data = await response.json();

      console.log('🔍 [CURRENT-CLUSTER] Full API response:', data);

      if (data.success) {
        setClusterProperties(data.cluster);
        console.log('✅ [CURRENT-CLUSTER] Fetched cluster properties:', data.cluster);
      } else {
        console.error('❌ [CURRENT-CLUSTER] API error:', data.message);
        setError(data.message || 'Failed to fetch cluster properties');
      }
    } catch (error) {
      console.error('❌ [CURRENT-CLUSTER] Error fetching cluster properties:', error);
      setError('Failed to fetch cluster properties');
    } finally {
      setLoadingProperties(false);
    }
  };

  // Auto-fetch properties when component mounts
  useEffect(() => {
    if (clusterName) {
      fetchClusterProperties();
    }
  }, [clusterName]);

  // Helper functions for cluster specifications
  const getCpuCount = (tier: string) => {
    const cpuMap: { [key: string]: number } = {
      'M10': 2, 'M20': 2, 'M30': 2, 'M40': 4, 'M50': 4, 'M60': 8, 'M80': 8, 'M100': 8, 'M140': 8, 'M200': 8, 'M300': 16, 'M400': 16, 'M500': 16
    };
    return cpuMap[tier] || 'Unknown';
  };

  const getRamSize = (tier: string) => {
    const ramMap: { [key: string]: string } = {
      'M10': '2GB', 'M20': '4GB', 'M30': '8GB', 'M40': '8GB', 'M50': '16GB', 'M60': '16GB', 'M80': '32GB', 'M100': '32GB', 'M140': '64GB', 'M200': '64GB', 'M300': '128GB', 'M400': '256GB', 'M500': '512GB'
    };
    return ramMap[tier] || 'Unknown';
  };

  const getStorageSize = (tier: string) => {
    const storageMap: { [key: string]: string } = {
      'M10': '10GB', 'M20': '20GB', 'M30': '40GB', 'M40': '80GB', 'M50': '160GB', 'M60': '320GB', 'M80': '640GB', 'M100': '1.28TB', 'M140': '2.56TB', 'M200': '5.12TB', 'M300': '10.24TB', 'M400': '20.48TB', 'M500': '40.96TB'
    };
    return storageMap[tier] || 'Unknown';
  };

  return (
    <Card className="bg-white shadow-lg border border-gray-200 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Database className="h-6 w-6 text-green-600" />
          Cluster Details: {clusterName}
        </CardTitle>
        <p className="text-sm text-gray-600">Detailed information about your newly created MongoDB Atlas cluster</p>
      </CardHeader>
      <CardContent className="p-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
            <Button 
              onClick={fetchClusterProperties} 
              disabled={loadingProperties}
              className="mt-2"
              size="sm"
            >
              {loadingProperties ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                'Retry'
              )}
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loadingProperties && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
              <p className="text-gray-600">Fetching cluster details...</p>
            </div>
          </div>
        )}

        {/* Cluster Properties Display */}
        {clusterProperties && !loadingProperties && (
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Basic Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cluster Name:</span>
                    <span className="font-medium">{clusterProperties.name || clusterName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tier:</span>
                    <span className="font-medium">{clusterProperties.tier || clusterTier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">State:</span>
                    <span className="font-medium text-green-600">{clusterProperties.state || 'IDLE'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cloud Provider:</span>
                    <span className="font-medium">{clusterProperties.cloudProvider || 'AZURE'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Region:</span>
                    <span className="font-medium">{clusterProperties.region || 'US_EAST_2'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Specifications</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">vCPUs:</span>
                    <span className="font-medium">{getCpuCount(clusterTier)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">RAM:</span>
                    <span className="font-medium">{getRamSize(clusterTier)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Storage:</span>
                    <span className="font-medium">{getStorageSize(clusterTier)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">MongoDB Version:</span>
                    <span className="font-medium">{clusterProperties.mongoVersion || '7.0'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Replication Factor:</span>
                    <span className="font-medium">{clusterProperties.replicationFactor || 3}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Features */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                Security Features
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">TLS Encryption:</span>
                    <span className="font-medium text-green-600">✓ Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Database Auditing:</span>
                    <span className="font-medium text-green-600">
                      {auditingEnabled ? '✓ Enabled' : '✗ Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Write Concern:</span>
                    <span className="font-medium">majority</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Retry Writes:</span>
                    <span className="font-medium text-green-600">✓ Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Auth Source:</span>
                    <span className="font-medium">admin</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data Encryption at Rest:</span>
                    <span className="font-medium text-green-600">✓ Enabled</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Auditing Status */}
            {auditingEnabled && auditingStatus && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Database Auditing</h3>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-medium">{auditingStatus}</span>
                  </div>
                  {auditingMessage && (
                    <p className="text-sm text-green-600 mt-2">{auditingMessage}</p>
                  )}
                </div>
              </div>
            )}

            {/* Connection Information - Hidden for security */}
            {false && connectionString && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Connection Information</h3>
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <p className="text-sm text-gray-600 mb-2">Connection String:</p>
                  <code className="text-xs bg-white p-2 rounded border block break-all">
                    {connectionString}
                  </code>
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <div className="flex justify-center pt-4">
              <Button 
                onClick={fetchClusterProperties} 
                disabled={loadingProperties}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Details
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
