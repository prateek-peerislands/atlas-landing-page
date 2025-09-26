import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RequirementsForm, { DeveloperRequirements } from "@/components/requirements-form";
import AISuggestionDisplay, { ClusterTierSuggestion } from "@/components/ai-suggestion-display";
import DatabaseCreationCard from "@/components/database-creation-card";
import ClusterPropertiesDisplay from "@/components/cluster-properties-display";
import CurrentClusterDetails from "@/components/current-cluster-details";
import { useToast } from "@/hooks/use-toast";

type AppState = 'requirements' | 'suggestion' | 'provisioning' | 'success';
type TabType = 'provisioning' | 'management';

export default function Home() {
  console.log('🏠 [HOME] Home page component rendered');
  const [, setLocation] = useLocation();
  
  // Session-based state persistence functions
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const saveStateToStorage = (state: any) => {
    if (!currentSessionId) return;
    try {
      localStorage.setItem(`atlas-app-state-${currentSessionId}`, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  };

  const loadStateFromStorage = () => {
    if (!currentSessionId) return null;
    try {
      const saved = localStorage.getItem(`atlas-app-state-${currentSessionId}`);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error);
      return null;
    }
  };

  const clearStateFromStorage = () => {
    try {
      // Clear all session-based storage
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('atlas-app-state-') || key.startsWith('atlas-requirements-')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear state from localStorage:', error);
    }
  };

  // Get session ID from server
  useEffect(() => {
    const getSessionId = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/session-id');
        const data = await response.json();
        setCurrentSessionId(data.sessionId);
        console.log('🔄 [SESSION] Got session ID:', data.sessionId);
      } catch (error) {
        console.warn('Failed to get session ID:', error);
      }
    };
    getSessionId();
  }, []);
  
  const [activeTab, setActiveTab] = useState<TabType>('provisioning');
  const [appState, setAppState] = useState<AppState>('requirements');
  const [requirements, setRequirements] = useState<DeveloperRequirements | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<ClusterTierSuggestion | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopComment, setStopComment] = useState("");
  const [clusterRequestId, setClusterRequestId] = useState<string | null>(null);
  const [clusterProgress, setClusterProgress] = useState(0);
  const [clusterStatusMessage, setClusterStatusMessage] = useState('');
  const [auditingEnabled, setAuditingEnabled] = useState(false);
  const [auditingStatus, setAuditingStatus] = useState('');
  const [auditingMessage, setAuditingMessage] = useState('');
  const [isRestoringState, setIsRestoringState] = useState(false);
  const [availableClusters, setAvailableClusters] = useState<any[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [progressInterval, setProgressInterval] = useState<NodeJS.Timeout | null>(null);
  const [clusterStartTime, setClusterStartTime] = useState<number | null>(null);
  const clusterStartTimeRef = useRef<number | null>(null);
  const { toast } = useToast();
  // Upper bound for time-based progress, driven by server-reported progress
  const [serverProgressCap, setServerProgressCap] = useState(0);

  // Progress calculation function
  const calculateProgress = (startTime: number): number => {
    const now = Date.now();
    const elapsed = now - startTime;
    const totalDuration = 7.5 * 60 * 1000; // 7.5 minutes in milliseconds
    
    if (elapsed >= totalDuration) {
      return Math.min(99, serverProgressCap > 0 ? serverProgressCap : 99); // Cap at 99% until cluster is actually ready
    }
    
    const progress = (elapsed / totalDuration) * 99;
    const timeBased = Math.floor(progress);
    // Never exceed the last server-reported progress while not IDLE
    if (serverProgressCap > 0) return Math.min(timeBased, serverProgressCap);
    return timeBased; // Return whole number only
  };

  // Start progress tracking
  const startProgressTracking = (requestId: string) => {
    // Set start time if not already set (for fresh starts)
    if (!clusterStartTimeRef.current) {
      const startTime = Date.now();
      clusterStartTimeRef.current = startTime;
      setClusterStartTime(startTime);
    }
    
    // Clear any existing interval
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    const interval = setInterval(() => {
      // Use the ref for immediate access to start time
      if (clusterStartTimeRef.current) {
        const progress = calculateProgress(clusterStartTimeRef.current);
        setClusterProgress(prev => Math.max(prev, progress));
      }
    }, 1000); // Update every second
    
    setProgressInterval(interval);
  };

  // Stop progress tracking
  const stopProgressTracking = () => {
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
  };

  // Track last started request to reset timer when a new request begins
  const lastStartedRequestIdRef = useRef<string | null>(null);

  // Reset timer and progress when a new request starts while in provisioning
  useEffect(() => {
    if (appState !== 'provisioning' || !clusterRequestId) return;
    if (lastStartedRequestIdRef.current !== clusterRequestId) {
      lastStartedRequestIdRef.current = clusterRequestId;
      stopProgressTracking();
      setClusterProgress(0);
      setServerProgressCap(0);
      setClusterStatusMessage('Initializing cluster creation...');
      const now = Date.now();
      clusterStartTimeRef.current = now;
      setClusterStartTime(now);
      startProgressTracking(clusterRequestId);
    }
  }, [appState, clusterRequestId]);

  // Restore state on component mount
  useEffect(() => {
    if (!currentSessionId) return; // Wait for session ID
    
    const savedState = loadStateFromStorage();
    if (savedState) {
      console.log('🔄 [HOME] Restoring state from localStorage:', savedState);
      setIsRestoringState(true);
      
      // Restore all state
      if (savedState.appState) setAppState(savedState.appState);
      if (savedState.requirements) setRequirements(savedState.requirements);
      if (savedState.aiSuggestion) setAiSuggestion(savedState.aiSuggestion);
      if (savedState.selectedTier) setSelectedTier(savedState.selectedTier);
      if (savedState.clusterRequestId) setClusterRequestId(savedState.clusterRequestId);
      if (savedState.clusterProgress) setClusterProgress(savedState.clusterProgress);
      if (savedState.clusterStatusMessage) setClusterStatusMessage(savedState.clusterStatusMessage);
      if (savedState.auditingEnabled) setAuditingEnabled(savedState.auditingEnabled);
      if (savedState.auditingStatus) setAuditingStatus(savedState.auditingStatus);
      if (savedState.auditingMessage) setAuditingMessage(savedState.auditingMessage);
      // Restore start time only if it belongs to the same request and not stale
      const totalDuration = 7.5 * 60 * 1000;
      if (
        savedState.clusterStartTime &&
        savedState.clusterRequestIdForStartTime &&
        savedState.clusterRequestId &&
        savedState.clusterRequestIdForStartTime === savedState.clusterRequestId
      ) {
        const savedStart = savedState.clusterStartTime as number;
        const stale = Date.now() - savedStart > totalDuration;
        const effectiveStart = stale ? Date.now() : savedStart;
        setClusterStartTime(effectiveStart);
        clusterStartTimeRef.current = effectiveStart;
      } else {
        setClusterStartTime(null);
        clusterStartTimeRef.current = null;
      }
      
      // If we were in provisioning state, continue monitoring
      if (savedState.appState === 'provisioning' && savedState.clusterRequestId) {
        console.log('🔄 [HOME] Resuming cluster monitoring for request:', savedState.clusterRequestId);
        // Start progress tracking - it will use the restored clusterStartTime
        startProgressTracking(savedState.clusterRequestId);
      }
      
      // If we were in success state, stay there
      if (savedState.appState === 'success') {
        console.log('🔄 [HOME] Restored to success state, staying on provision page');
      }
      
      // If we were in suggestion state, stay there
      if (savedState.appState === 'suggestion') {
        console.log('🔄 [HOME] Restored to suggestion state, staying on AI suggestion page');
      }
      
      // Hide loading indicator after a short delay
      setTimeout(() => {
        setIsRestoringState(false);
      }, 1000);
    }
  }, [currentSessionId]); // Depend on currentSessionId

  // Save state whenever it changes
  useEffect(() => {
    const currentState = {
      appState,
      requirements,
      aiSuggestion,
      selectedTier,
      clusterRequestId,
      clusterProgress,
      clusterStatusMessage,
      auditingEnabled,
      auditingStatus,
      auditingMessage,
      clusterStartTime,
      clusterRequestIdForStartTime: clusterRequestId
    };
    saveStateToStorage(currentState);
  }, [appState, requirements, aiSuggestion, selectedTier, clusterRequestId, clusterProgress, clusterStatusMessage, auditingEnabled, auditingStatus, auditingMessage, clusterStartTime]);

  // Progress tracking effect
  useEffect(() => {
    if (!clusterRequestId || appState !== 'provisioning' || isStopping) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/cluster-status?id=${clusterRequestId}`);
        const data = await response.json();
        
        if (data.state) {
          // Update status and use server to cap client-side timer
          setClusterStatusMessage(data.statusMessage || '');
          setAuditingEnabled(data.auditingEnabled || false);
          setAuditingStatus(data.auditingStatus || '');
          setAuditingMessage(data.auditingMessage || '');
          if (typeof data.progress === 'number' && data.progress > 0 && data.progress < 100) {
            setServerProgressCap(Math.floor(data.progress));
          }
          
          if (data.state === 'IDLE') {
            // Cluster is ready - set progress to 100% and show success
            setClusterProgress(100);
            stopProgressTracking();
            setAppState('success');
            clearInterval(interval);
          } else if (data.state === 'FAILED') {
            stopProgressTracking();
            toast({
              title: "Error",
              description: data.statusMessage || "Cluster creation failed",
              variant: "destructive",
            });
            setAppState('suggestion');
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Error checking cluster status:', error);
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [clusterRequestId, appState, isStopping, toast]);

  // Cleanup progress interval on unmount
  useEffect(() => {
    return () => {
      stopProgressTracking();
    };
  }, []);

  const handleRequirementsSubmit = async (req: DeveloperRequirements) => {
    setIsLoading(true);
    setRequirements(req);
    
    try {
      const response = await fetch('/api/suggest-cluster-tier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requirements: req }),
      });

      const data = await response.json();
      
      if (data.success) {
        setAiSuggestion(data.suggestion);
        setAppState('suggestion');
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to get AI suggestion",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error getting AI suggestion:', error);
      toast({
        title: "Error",
        description: "Failed to connect to AI service",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptSuggestion = async () => {
    if (aiSuggestion && requirements) {
      setSelectedTier(aiSuggestion.tier);
      setAppState('provisioning');
      setIsLoading(true);
      setClusterProgress(0);
      setClusterStatusMessage('Initializing cluster creation...');
      
      try {
        const response = await fetch('/api/create-cluster', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clusterName: requirements.clusterName,
            tier: aiSuggestion.tier,
            region: 'us-east-2', // Hardcoded to US East 2
            cloudProvider: 'AZURE' // Hardcoded to Azure
          }),
        });

        const data = await response.json();
        
        if (data.success) {
          setClusterRequestId(data.requestId);
          // Start the dynamic progress tracking
          startProgressTracking(data.requestId);
        } else {
          toast({
            title: "Error",
            description: data.message || "Failed to create cluster",
            variant: "destructive",
          });
          setAppState('suggestion');
        }
      } catch (error) {
        console.error('Error creating cluster:', error);
        toast({
          title: "Error",
          description: "Failed to create cluster",
          variant: "destructive",
        });
        setAppState('suggestion');
      } finally {
        setIsLoading(false);
      }
    }
  };



  const handleBackToRequirements = () => {
    setAppState('requirements');
    setAiSuggestion(null);
    setRequirements(null);
  };


  const handleStartOver = () => {
    setAppState('requirements');
    setRequirements(null);
    setAiSuggestion(null);
    setSelectedTier('');
    setClusterRequestId(null);
    setClusterProgress(0);
    setClusterStatusMessage('');
    setAuditingEnabled(false);
    setAuditingStatus('');
    setAuditingMessage('');
    
    // Clear localStorage
    clearStateFromStorage();
  };

  // Stop cluster handler with confirmation, MCP call, and cleanup
  const handleStopCluster = async (comment?: string) => {
    if (!clusterRequestId) return;
    try {
      setIsStopping(true);
      // Immediately freeze the progress bar and update status locally
      stopProgressTracking();
      setClusterStatusMessage('Cancelling provisioning and requesting deletion...');
      setServerProgressCap(clusterProgress); // freeze timer at current cap
      // Call backend which proxies to MCP
      const stopClusterName = (requirements && requirements.clusterName) || localStorage.getItem('atlas-cluster-name') || undefined;
      const resp = await fetch('/api/stop-cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: clusterRequestId, comment: comment || undefined, clusterName: stopClusterName })
      });

      let ok = resp.ok;
      let json: any = null;
      try {
        json = await resp.json();
      } catch {}
      if (json && json.success === false) ok = false;

      // Wait for deletion confirmation by polling status
      const start = Date.now();
      const timeoutMs = 12 * 60 * 1000; // 12 minutes
      let deletionConfirmed = false;
      while (Date.now() - start < timeoutMs) {
        try {
          const s = await fetch(`/api/cluster-status?id=${encodeURIComponent(clusterRequestId)}`);
          if (s.status === 404) {
            deletionConfirmed = true;
            break;
          }
          const sj = await s.json();
          const st = sj.state as string | undefined;
          const msg = (sj.statusMessage as string | undefined) || '';
          if (st === 'DELETING') {
            setClusterStatusMessage('Deletion in progress in Atlas...');
          }
          if ((msg && msg.toLowerCase().includes('deleted')) || st === 'DELETED') {
            deletionConfirmed = true;
            break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 15000));
      }

      // Stop timers/polling regardless to avoid leaks
      stopProgressTracking();

      // Clear local persisted state (both session state and cluster keys)
      try {
        clearStateFromStorage();
        localStorage.removeItem('atlas-cluster-request-id');
        localStorage.removeItem('atlas-cluster-name');
        localStorage.removeItem('atlas-cluster-tier');
        localStorage.removeItem('atlas-data-populated');
      } catch {}

      // Reset UI state
      setClusterProgress(0);
      setClusterStatusMessage('');
      setClusterRequestId(null);
      setAppState('requirements');

      if (ok && deletionConfirmed) {
        toast({ title: 'Cluster deleted', description: 'Atlas deletion confirmed and state cleared.' });
      } else if (ok && !deletionConfirmed) {
        toast({ title: 'Stop requested', description: 'Deletion is in progress in Atlas. You can proceed.', variant: 'default' });
      } else {
        const msg = (json && (json.message || json.error)) || 'Failed to stop on server; local state cleared.';
        toast({ title: 'Stop request completed with issues', description: msg, variant: 'destructive' });
      }
    } catch (e: any) {
      stopProgressTracking();
      setClusterProgress(0);
      setClusterStatusMessage('');
      setClusterRequestId(null);
      setAppState('requirements');
      toast({ title: 'Stop request error', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setIsStopping(false);
    }
  };

  const openStopModal = () => {
    setStopComment("");
    setShowStopModal(true);
  };

  const confirmStopModal = async () => {
    setShowStopModal(false);
    await handleStopCluster(stopComment.trim() || undefined);
  };

  // Navigation functions
  const handleGoToDatabaseManagement = () => {
    setActiveTab('management');
  };

  const handleGoToRequirements = () => {
    setActiveTab('provisioning');
    setAppState('requirements');
  };

  // Fetch available clusters
  const fetchAvailableClusters = async () => {
    setLoadingClusters(true);
    try {
      const response = await fetch('http://localhost:3001/api/clusters');
      const data = await response.json();
      
      if (data.success) {
        setAvailableClusters(data.clusters || []);
        console.log('✅ [HOME] Fetched clusters:', data.clusters);
      } else {
        console.error('❌ [HOME] Failed to fetch clusters:', data.error);
        setAvailableClusters([]);
      }
    } catch (error) {
      console.error('❌ [HOME] Error fetching clusters:', error);
      setAvailableClusters([]);
    } finally {
      setLoadingClusters(false);
    }
  };

  // Fetch clusters when management tab becomes active
  useEffect(() => {
    if (activeTab === 'management') {
      fetchAvailableClusters();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* State Restoration Indicator */}
      {isRestoringState && (
        <div className="fixed top-4 right-4 z-50 bg-green-100 border border-green-200 rounded-lg p-3 shadow-lg">
          <div className="flex items-center space-x-2 text-green-700 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
            <span>Restoring your progress...</span>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-green-600 mb-6 leading-tight">
            MongoDB Atlas Management Platform
          </h1>
          <p className="text-xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
            Streamline your MongoDB Atlas operations with intelligent cluster provisioning, 
            AI-powered tier recommendations, and comprehensive database management tools. 
            Built with real-time MCP server integration for seamless cloud deployment.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg shadow-lg p-1 inline-flex">
            <button
              onClick={() => setActiveTab('provisioning')}
              className={`px-6 py-3 rounded-md font-medium transition-colors ${
                activeTab === 'provisioning'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Cluster Provisioning
            </button>
            <button
              onClick={() => setActiveTab('management')}
              className={`px-6 py-3 rounded-md font-medium transition-colors ${
                activeTab === 'management'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Database Management
            </button>
          </div>
        </div>
        
        {/* Tab Content */}
        {activeTab === 'provisioning' && (
          <>
            {/* Progress Indicator */}
            <div className="flex justify-center mb-8">
              <div className="flex items-center space-x-4">
                <div className={`flex items-center ${appState === 'requirements' ? 'text-green-600' : appState === 'suggestion' || appState === 'provisioning' || appState === 'success' ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appState === 'requirements' ? 'bg-green-600 text-white' : appState === 'suggestion' || appState === 'provisioning' || appState === 'success' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                    1
                  </div>
                  <span className="ml-2 font-medium">Requirements</span>
                </div>
                <div className={`w-8 h-0.5 ${appState === 'suggestion' || appState === 'provisioning' || appState === 'success' ? 'bg-green-600' : 'bg-gray-300'}`}></div>
                <div className={`flex items-center ${appState === 'suggestion' ? 'text-green-600' : appState === 'provisioning' || appState === 'success' ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appState === 'suggestion' ? 'bg-green-600 text-white' : appState === 'provisioning' || appState === 'success' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                    2
                  </div>
                  <span className="ml-2 font-medium">AI Suggestion</span>
                </div>
                <div className={`w-8 h-0.5 ${appState === 'provisioning' || appState === 'success' ? 'bg-green-600' : 'bg-gray-300'}`}></div>
                <div className={`flex items-center ${appState === 'provisioning' ? 'text-green-600' : appState === 'success' ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${appState === 'provisioning' ? 'bg-green-600 text-white' : appState === 'success' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                    3
                  </div>
                  <span className="ml-2 font-medium">Provision</span>
                </div>
              </div>
            </div>

            {/* Main Content */}
        {appState === 'requirements' && (
          <RequirementsForm 
            onSubmit={handleRequirementsSubmit}
            isLoading={isLoading}
          />
        )}

        {appState === 'suggestion' && aiSuggestion && (
          <AISuggestionDisplay
            suggestion={aiSuggestion}
            onAccept={handleAcceptSuggestion}
            onBack={handleBackToRequirements}
            isLoading={isLoading}
          />
        )}


        {appState === 'provisioning' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Provisioning Cluster</h2>
                <p className="text-gray-600">Creating your MongoDB Atlas cluster with tier: {selectedTier}</p>
              </div>
              
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span className="font-medium">{clusterProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-green-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${clusterProgress}%` }}
                  ></div>
                </div>
                {/* Progress Phase Indicator */}
                <div className="mt-2 text-xs text-gray-500 text-center">
                  {clusterProgress < 10 ? (
                    <span>Initializing cluster creation...</span>
                  ) : clusterProgress < 20 ? (
                    <span>Setting up infrastructure...</span>
                  ) : clusterProgress < 30 ? (
                    <span>Configuring database settings...</span>
                  ) : clusterProgress < 40 ? (
                    <span>Creating network resources...</span>
                  ) : clusterProgress < 50 ? (
                    <span>Setting up security configurations...</span>
                  ) : clusterProgress < 60 ? (
                    <span>Deploying cluster nodes...</span>
                  ) : clusterProgress < 70 ? (
                    <span>Configuring storage systems...</span>
                  ) : clusterProgress < 80 ? (
                    <span>Setting up monitoring services...</span>
                  ) : clusterProgress < 90 ? (
                    <span>Finalizing cluster setup...</span>
                  ) : clusterProgress < 99 ? (
                    <span>Completing final configurations...</span>
                  ) : (
                    <span>🔍 Checking cluster state for completion</span>
                  )}
                </div>
              </div>
              
              {/* Stop Cluster Action */}
              <div className="flex justify-center mt-4">
                <button
                  onClick={openStopModal}
                  disabled={isStopping}
                  className="px-4 py-2 rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isStopping ? 'Stopping…' : 'Stop Cluster'}
                </button>
              </div>

              {/* Status Message */}
              <div className="text-center">
                <p className="text-gray-700 font-medium">{clusterStatusMessage}</p>
                
              </div>
            </div>
          </div>
        )}

        {appState === 'success' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Cluster Created Successfully!</h2>
            <p className="text-gray-600 mb-4">Your MongoDB Atlas cluster with tier {selectedTier} is now ready.</p>
            
            {/* Auditing Status in Success */}
            {auditingEnabled && (
              <div className="mb-6 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center justify-center space-x-2 text-green-700 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>🔍 Database Auditing: {auditingStatus}</span>
                </div>
                {auditingMessage && (
                  <p className="text-xs text-green-600 mt-1">{auditingMessage}</p>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={handleStartOver}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Create Another Cluster
              </button>
              <button
                onClick={handleGoToDatabaseManagement}
                className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Manage Databases →
              </button>
            </div>

            {/* Current Cluster Details */}
            {requirements && (
              <div className="max-w-4xl mx-auto">
                <CurrentClusterDetails
                  clusterName={requirements.clusterName}
                  clusterTier={selectedTier}
                  clusterId={clusterRequestId || undefined}
                  connectionString={clusterProgress === 100 ? `mongodb+srv://${requirements.clusterName}.ihoolr.mongodb.net/` : undefined}
                  auditingEnabled={auditingEnabled}
                  auditingStatus={auditingStatus}
                  auditingMessage={auditingMessage}
                />
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Database Management Tab */}
        {activeTab === 'management' && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Database Management</h2>
              <p className="text-gray-600">
                Create databases, collections, and manage data in your existing MongoDB Atlas clusters
              </p>
            </div>
            
            <div className="grid gap-8">
              <DatabaseCreationCard />
            </div>
            
            <div className="text-center">
              <button
                onClick={handleGoToRequirements}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                ← Create New Cluster
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Stop Cluster Confirmation Modal */}
      <Dialog open={showStopModal} onOpenChange={setShowStopModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm stop and add a comment</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <label className="block text-sm text-gray-600 mb-1">Comment (optional)</label>
            <textarea
              value={stopComment}
              onChange={(e) => setStopComment(e.target.value)}
              className="w-full border rounded-md p-2 text-sm"
              rows={4}
              placeholder="Reason for stopping the cluster"
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowStopModal(false)}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              No
            </button>
            <button
              onClick={confirmStopModal}
              disabled={isStopping}
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Yes, Stop Cluster
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}