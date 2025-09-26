import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CheckCircle, AlertCircle, Cpu, HardDrive, Users, Zap, Shield, Database } from 'lucide-react';

export interface ClusterTierSuggestion {
  tier: 'M10' | 'M20' | 'M30' | 'M40' | 'M50' | 'M60' | 'M80' | 'M100' | 'M140' | 'M200' | 'M300' | 'M400' | 'M500';
  name: string;
  vcpus: number;
  ram: number;
  storage: string;
  reasoning: string[];
  confidence: number;
  estimatedCost: string;
  features: string[];
}

interface AISuggestionDisplayProps {
  suggestion: ClusterTierSuggestion;
  onAccept: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

const AISuggestionDisplay: React.FC<AISuggestionDisplayProps> = ({
  suggestion,
  onAccept,
  onBack,
  isLoading = false
}) => {
  const getTierColor = (tier: string) => {
    const tierNumber = parseInt(tier.replace('M', ''));
    if (tierNumber <= 20) return 'bg-green-100 text-green-800 border-green-200';
    if (tierNumber <= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (tierNumber <= 100) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-green-600" />
          AI Cluster Tier Suggestion
        </CardTitle>
        <CardDescription>
          Based on your requirements, our AI recommends the following cluster configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tier Recommendation */}
        <div className="text-center">
          <Badge className={`text-lg px-4 py-2 ${getTierColor(suggestion.tier)}`}>
            {suggestion.tier} - {suggestion.name}
          </Badge>
          <p className="text-sm text-gray-600 mt-2">
            Confidence: <span className={getConfidenceColor(suggestion.confidence)}>
              {suggestion.confidence}%
            </span>
          </p>
        </div>

        {/* Specifications */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <Cpu className="h-6 w-6 mx-auto text-green-600 mb-1" />
            <p className="text-sm font-medium">{suggestion.vcpus} vCPUs</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <HardDrive className="h-6 w-6 mx-auto text-green-600 mb-1" />
            <p className="text-sm font-medium">{suggestion.ram} GB RAM</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <Database className="h-6 w-6 mx-auto text-purple-600 mb-1" />
            <p className="text-sm font-medium">{suggestion.storage}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <Zap className="h-6 w-6 mx-auto text-yellow-600 mb-1" />
            <p className="text-sm font-medium">{suggestion.estimatedCost}</p>
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            Why this tier?
          </h4>
          <ul className="space-y-2">
            {suggestion.reasoning.map((reason, index) => (
              <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-green-500 mt-1">•</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>

        {/* Features */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-600" />
            Included Features
          </h4>
          <div className="flex flex-wrap gap-2">
            {suggestion.features.map((feature, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button 
            onClick={onBack} 
            variant="outline" 
            className="px-4"
            disabled={isLoading}
          >
            ← Back to Requirements
          </Button>
          <Button 
            onClick={onAccept} 
            className="flex-1"
            disabled={isLoading}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Accept & Provision
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AISuggestionDisplay;
