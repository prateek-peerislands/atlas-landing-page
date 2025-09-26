import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Loader2, Brain, CheckCircle, AlertCircle, Globe } from 'lucide-react';

interface RequirementsFormProps {
  onSubmit: (requirements: DeveloperRequirements) => void;
  isLoading?: boolean;
}

export interface DeveloperRequirements {
  clusterName: string;
  environment: 'production' | 'development' | 'testing';
  dataVolume: 'small' | 'medium' | 'large' | 'enterprise';
  concurrentUsers: 'low' | 'medium' | 'high' | 'very-high';
  queryComplexity: 'simple' | 'medium' | 'complex' | 'analytics';
  performanceRequirements: 'low' | 'medium' | 'high' | 'critical';
  geographicRegion?: string;
}

const RequirementsForm: React.FC<RequirementsFormProps> = ({ onSubmit, isLoading = false }) => {
  const [requirements, setRequirements] = useState<DeveloperRequirements>({
    clusterName: '',
    environment: 'development',
    dataVolume: 'small',
    concurrentUsers: 'low',
    queryComplexity: 'simple',
    performanceRequirements: 'medium',
    geographicRegion: 'us-east-2' // Hardcoded to US East 2
  });

  // Get session ID from server for session-based persistence
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    const getSessionId = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/session-id');
        const data = await response.json();
        setCurrentSessionId(data.sessionId);
      } catch (error) {
        console.warn('Failed to get session ID:', error);
      }
    };
    getSessionId();
  }, []);

  // Restore form data from localStorage on mount (session-based)
  useEffect(() => {
    if (!currentSessionId) return;
    
    const savedRequirements = localStorage.getItem(`atlas-requirements-${currentSessionId}`);
    if (savedRequirements) {
      try {
        const parsed = JSON.parse(savedRequirements);
        setRequirements(parsed);
        console.log('🔄 [REQUIREMENTS] Restored form data from localStorage:', parsed);
      } catch (error) {
        console.warn('Failed to restore requirements from localStorage:', error);
      }
    }
  }, [currentSessionId]);

  // Save form data to localStorage whenever it changes (session-based)
  useEffect(() => {
    if (!currentSessionId) return;
    localStorage.setItem(`atlas-requirements-${currentSessionId}`, JSON.stringify(requirements));
  }, [requirements, currentSessionId]);

  // Region is hardcoded, no need to fetch

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(requirements);
  };

  const handleChange = (field: keyof DeveloperRequirements, value: string) => {
    setRequirements(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-green-600" />
          Tell us about your project
        </CardTitle>
        <CardDescription>
          Our AI will analyze your requirements and suggest the optimal MongoDB Atlas cluster tier
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cluster Name */}
          <div className="space-y-2">
            <Label htmlFor="clusterName">Cluster Name *</Label>
            <Input
              id="clusterName"
              type="text"
              value={requirements.clusterName}
              onChange={(e) => handleChange('clusterName', e.target.value)}
              placeholder="Enter cluster name (e.g., my-app-cluster)"
              required
            />
            <p className="text-sm text-gray-500">
              1-64 characters, letters, numbers, and hyphens only
            </p>
          </div>

          {/* Environment Type */}
          <div className="space-y-2">
            <Label htmlFor="environment">Environment Type *</Label>
            <Select
              value={requirements.environment}
              onValueChange={(value) => handleChange('environment', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="testing">Testing</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Volume */}
          <div className="space-y-2">
            <Label htmlFor="dataVolume">Expected Data Volume *</Label>
            <Select
              value={requirements.dataVolume}
              onValueChange={(value) => handleChange('dataVolume', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select data volume" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small (0-10 GB)</SelectItem>
                <SelectItem value="medium">Medium (10-100 GB)</SelectItem>
                <SelectItem value="large">Large (100 GB - 1 TB)</SelectItem>
                <SelectItem value="enterprise">Enterprise (1+ TB)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Concurrent Users */}
          <div className="space-y-2">
            <Label htmlFor="concurrentUsers">Concurrent Users *</Label>
            <Select
              value={requirements.concurrentUsers}
              onValueChange={(value) => handleChange('concurrentUsers', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select user count" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low (1-10 users)</SelectItem>
                <SelectItem value="medium">Medium (10-100 users)</SelectItem>
                <SelectItem value="high">High (100-1000 users)</SelectItem>
                <SelectItem value="very-high">Very High (1000+ users)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Query Complexity */}
          <div className="space-y-2">
            <Label htmlFor="queryComplexity">Query Complexity *</Label>
            <Select
              value={requirements.queryComplexity}
              onValueChange={(value) => handleChange('queryComplexity', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select query complexity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple (CRUD operations)</SelectItem>
                <SelectItem value="medium">Medium (Aggregations, joins)</SelectItem>
                <SelectItem value="complex">Complex (Advanced analytics)</SelectItem>
                <SelectItem value="analytics">Analytics (Real-time processing)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Performance Requirements */}
          <div className="space-y-2">
            <Label htmlFor="performanceRequirements">Performance Requirements *</Label>
            <Select
              value={requirements.performanceRequirements}
              onValueChange={(value) => handleChange('performanceRequirements', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select performance level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low (Basic performance)</SelectItem>
                <SelectItem value="medium">Medium (Standard performance)</SelectItem>
                <SelectItem value="high">High (Optimized performance)</SelectItem>
                <SelectItem value="critical">Critical (Maximum performance)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Region is hardcoded to US East 2 */}
          <div className="space-y-2">
            <Label>Geographic Region</Label>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-600" />
                <span className="font-medium">US East 2 (Virginia)</span>
                <Badge variant="secondary" className="text-xs">Azure</Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Clusters will be provisioned in US East 2 region on Azure
              </p>
            </div>
          </div>


          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing requirements...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Get AI Suggestion
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default RequirementsForm;
