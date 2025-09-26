import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, CheckCircle, Cpu, HardDrive, Database, AlertCircle } from 'lucide-react';

interface TierOverrideSelectionProps {
  onSelectTier: (tier: string) => void;
  onBack: () => void;
  aiSuggestion?: string;
}

const TIER_OPTIONS = [
  {
    tier: 'M0',
    name: 'Free',
    vcpus: 'Shared',
    ram: 'Shared',
    storage: '512 MB',
    price: 'Free',
    description: 'Learning and exploration'
  },
  {
    tier: 'M10',
    name: 'Small',
    vcpus: 2,
    ram: 2,
    storage: '10 GB',
    price: '$57/month',
    description: 'Development and small applications'
  },
  {
    tier: 'M20',
    name: 'Medium',
    vcpus: 2,
    ram: 4,
    storage: '20 GB',
    price: '$147/month',
    description: 'Medium applications'
  },
  {
    tier: 'M30',
    name: 'Large',
    vcpus: 2,
    ram: 8,
    storage: '40 GB',
    price: '$388/month',
    description: 'Production, high traffic'
  },
  {
    tier: 'M40',
    name: 'X-Large',
    vcpus: 4,
    ram: 16,
    storage: '80 GB',
    price: '$747/month',
    description: 'Large applications'
  },
  {
    tier: 'M50',
    name: 'XX-Large',
    vcpus: 8,
    ram: 32,
    storage: '160 GB',
    price: '$1,437/month',
    description: 'High-performance applications'
  },
  {
    tier: 'M60',
    name: 'XXX-Large',
    vcpus: 16,
    ram: 64,
    storage: '320 GB',
    price: '$2,847/month',
    description: 'Very high-performance applications'
  },
  {
    tier: 'M80',
    name: 'Ultra Large',
    vcpus: 32,
    ram: 128,
    storage: '750 GB',
    price: '$5,258/month',
    description: 'Enterprise-level applications'
  },
  {
    tier: 'M140',
    name: 'Giga Large',
    vcpus: 48,
    ram: 192,
    storage: '1 TB',
    price: '$7,915/month',
    description: 'Large enterprise applications'
  },
  {
    tier: 'M200',
    name: 'Tera Large',
    vcpus: 64,
    ram: 256,
    storage: '1.5 TB',
    price: '$10,508/month',
    description: 'Very large enterprise applications'
  },
  {
    tier: 'M300',
    name: 'Peta Large',
    vcpus: 96,
    ram: 384,
    storage: '2 TB',
    price: '$15,735/month',
    description: 'Maximum enterprise applications'
  }
];

const TierOverrideSelection: React.FC<TierOverrideSelectionProps> = ({
  onSelectTier,
  onBack,
  aiSuggestion
}) => {
  const [selectedTier, setSelectedTier] = useState<string>('');

  const handleTierSelect = (tier: string) => {
    setSelectedTier(tier);
  };

  const handleConfirm = () => {
    if (selectedTier) {
      onSelectTier(selectedTier);
    }
  };

  const getTierColor = (tier: string) => {
    const tierNumber = parseInt(tier.replace('M', ''));
    if (tierNumber <= 20) return 'border-green-200 hover:border-green-300';
    if (tierNumber <= 50) return 'border-yellow-200 hover:border-yellow-300';
    if (tierNumber <= 100) return 'border-orange-200 hover:border-orange-300';
    return 'border-red-200 hover:border-red-300';
  };

  const getSelectedColor = (tier: string) => {
    const tierNumber = parseInt(tier.replace('M', ''));
    if (tierNumber <= 20) return 'ring-2 ring-green-500 border-green-500';
    if (tierNumber <= 50) return 'ring-2 ring-yellow-500 border-yellow-500';
    if (tierNumber <= 100) return 'ring-2 ring-orange-500 border-orange-500';
    return 'ring-2 ring-red-500 border-red-500';
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-green-600" />
          Manual Tier Selection
        </CardTitle>
        <CardDescription>
          Choose your preferred MongoDB Atlas cluster tier. 
          {aiSuggestion && (
            <span className="text-yellow-600 font-medium">
              {' '}AI suggested: {aiSuggestion}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tier Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TIER_OPTIONS.map((option) => (
            <div
              key={option.tier}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                selectedTier === option.tier
                  ? getSelectedColor(option.tier)
                  : getTierColor(option.tier)
              }`}
              onClick={() => handleTierSelect(option.tier)}
            >
              <div className="flex items-center justify-between mb-2">
                <Badge className="text-sm font-medium">
                  {option.tier}
                </Badge>
                {selectedTier === option.tier && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
              
              <h3 className="font-semibold text-lg mb-2">{option.name}</h3>
              
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Cpu className="h-4 w-4" />
                  {option.vcpus} vCPUs
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <HardDrive className="h-4 w-4" />
                  {option.ram} GB RAM
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Database className="h-4 w-4" />
                  {option.storage}
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-lg font-bold text-green-600">{option.price}</p>
                <p className="text-xs text-gray-500 mt-1">{option.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button 
            onClick={onBack} 
            variant="outline" 
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to AI Suggestion
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedTier}
            className="flex-1"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Confirm {selectedTier} Selection
          </Button>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">Manual Override</p>
              <p className="text-yellow-700">
                You're overriding the AI suggestion. Make sure the selected tier meets your performance 
                and cost requirements. You can always scale up or down later.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TierOverrideSelection;
