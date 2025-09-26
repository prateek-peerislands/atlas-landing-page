import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import DatabaseCreationCard from '@/components/database-creation-card';
import ClusterPropertiesDisplay from '@/components/cluster-properties-display';

export default function DatabaseManagement() {
  const [, setLocation] = useLocation();
  const [availableClusters, setAvailableClusters] = useState<any[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);

  // Fetch available clusters on component mount
  useEffect(() => {
    fetchAvailableClusters();
  }, []);

  const fetchAvailableClusters = async () => {
    try {
      setLoadingClusters(true);
      // Fetch clusters directly from Atlas API
      const response = await fetch('http://localhost:3001/api/atlas-clusters');
      if (response.ok) {
        const data = await response.json();
        setAvailableClusters(data.clusters || []);
      } else {
        // Fallback to server endpoint
        const fallbackResponse = await fetch('http://localhost:3001/api/clusters');
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Database Management
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            Create databases, collections, and manage data in your MongoDB Atlas clusters
          </p>
          
          {/* Navigation */}
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setLocation('/')}
              className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              ← Back to Cluster Provisioning
            </button>
          </div>
        </div>

        {/* Database Creation Card */}
        <div className="max-w-4xl mx-auto mb-12">
          <DatabaseCreationCard />
        </div>

        {/* Cluster Properties Display */}
        <div className="max-w-6xl mx-auto">
          <ClusterPropertiesDisplay availableClusters={availableClusters} />
        </div>
      </div>
    </div>
  );
}
