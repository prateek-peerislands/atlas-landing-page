import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { FaMicrosoft } from "react-icons/fa";

interface SuccessModalProps {
  clusterName: string;
  onClose: () => void;
}

export default function SuccessModal({ clusterName, onClose }: SuccessModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="text-center">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-green-500 text-2xl" />
          </div>

          {/* Success Message */}
          <h3 className="text-xl font-bold text-text-primary mb-2">Cluster Created Successfully!</h3>
          <p className="text-text-secondary mb-6">Your M10 cluster is now ready and available for connections.</p>

          {/* Cluster Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Cluster Name:</span>
                <span className="font-medium">{clusterName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Provider:</span>
                <span className="font-medium flex items-center space-x-1">
                  <FaMicrosoft className="text-blue-600" />
                  <span>Microsoft Azure</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Region:</span>
                <span className="font-medium">ap-south-2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Status:</span>
                <span className="text-green-600 font-medium">Active</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button className="w-full bg-mongodb-green hover:bg-mongodb-green hover:bg-opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
              Connect to Cluster
            </Button>
            <Button 
              variant="outline"
              className="w-full text-text-secondary border border-gray-300 rounded-lg py-3 px-6 hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              View All Clusters
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
