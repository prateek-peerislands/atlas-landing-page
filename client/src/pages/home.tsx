import { useState } from "react";
import ClusterCreationCard from "@/components/cluster-creation-card";
import DatabaseCreationCard from "@/components/database-creation-card";

export default function Home() {
  console.log('🏠 [HOME] Home page component rendered');
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            MongoDB Atlas Cluster Provisioning
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Create and manage your MongoDB Atlas clusters with our streamlined provisioning interface.
            Powered by direct MCP server integration for real-time cluster deployment.
          </p>
        </div>
        
        <ClusterCreationCard />
        <DatabaseCreationCard />
      </div>
    </div>
  );
}