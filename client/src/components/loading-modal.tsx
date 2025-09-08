import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Settings, CheckCircle, Circle } from "lucide-react";

interface LoadingModalProps {
  requestId: string;
  onComplete: () => void;
  onError: () => void;
}

interface StatusStep {
  id: string;
  label: string;
  completed: boolean;
}

export default function LoadingModal({ requestId, onComplete, onError }: LoadingModalProps) {
  const [steps, setSteps] = useState<StatusStep[]>([
    { id: "validate", label: "Validating cluster configuration", completed: false },
    { id: "provision", label: "Provisioning infrastructure", completed: false },
    { id: "security", label: "Configuring security settings", completed: false },
    { id: "finalize", label: "Finalizing deployment", completed: false },
  ]);

  const { data: status, error } = useQuery({
    queryKey: ["/api/status"],
    queryFn: async () => {
      const response = await fetch(`/api/status?id=${requestId}`);
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    refetchInterval: 2000,
    enabled: !!requestId,
  });

  useEffect(() => {
    if (status) {
      // Update steps based on progress
      const newSteps = [...steps];
      if (status.progress >= 25) newSteps[0].completed = true;
      if (status.progress >= 50) newSteps[1].completed = true;
      if (status.progress >= 75) newSteps[2].completed = true;
      if (status.progress >= 100) newSteps[3].completed = true;
      setSteps(newSteps);

      if (status.state === "IDLE") {
        onComplete();
      } else if (status.state === "FAILED") {
        onError();
      }
    }
  }, [status, onComplete, onError]);

  useEffect(() => {
    if (error) {
      onError();
    }
  }, [error, onError]);

  const progress = status?.progress || 0;
  const statusMessage = status?.statusMessage || "Initializing cluster creation...";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="text-center">
          {/* Loading Icon */}
          <div className="w-16 h-16 bg-mongodb-green bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings className="text-mongodb-green text-2xl animate-spin" />
          </div>

          {/* Status Text */}
          <h3 className="text-xl font-bold text-text-primary mb-2">Provisioning Your Cluster</h3>
          <p className="text-text-secondary mb-6">{statusMessage}</p>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-text-secondary mb-2">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress 
              value={progress} 
              className="w-full h-3"
            />
          </div>

          {/* Status Steps */}
          <div className="space-y-3 text-left">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center space-x-3">
                <div className="w-6 h-6 flex items-center justify-center">
                  {step.completed ? (
                    <div className="w-6 h-6 bg-mongodb-green rounded-full flex items-center justify-center">
                      <CheckCircle className="text-white w-4 h-4" />
                    </div>
                  ) : (
                    <Circle className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <span className={`text-sm ${step.completed ? "text-text-primary" : "text-text-secondary"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Cancel Button */}
          <Button 
            variant="outline"
            className="mt-6 px-6 py-2 text-text-secondary border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={onError}
          >
            Cancel Deployment
          </Button>
        </div>
      </div>
    </div>
  );
}
