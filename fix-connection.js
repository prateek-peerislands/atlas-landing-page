const fs = require('fs');

// Read the cluster requests file
const requestsFile = './cluster-requests.json';
let clusterRequests = {};

if (fs.existsSync(requestsFile)) {
  const data = fs.readFileSync(requestsFile, 'utf8');
  clusterRequests = JSON.parse(data);
}

// Find the atlas-land cluster request
const requestId = 'req-1757414799293';
const clusterRequest = clusterRequests[requestId];

if (clusterRequest) {
  console.log('Current connection string:', clusterRequest.mongoClusterUri);
  
  // Update the connection string with correct format
  const username = process.env.MONGODB_USERNAME || 'atlas_admin';
  const password = process.env.MONGODB_PASSWORD || 'zF04Abmtckckchuv';
  const clusterName = clusterRequest.actualClusterName || clusterRequest.clusterName;
  const clusterId = clusterRequest.clusterId;
  
  // New format: clustername.clusterid.mongodb.net
  clusterRequest.mongoClusterUri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${clusterName}.${clusterId}.mongodb.net/`;
  
  console.log('Updated connection string:', clusterRequest.mongoClusterUri);
  
  // Save back to file
  fs.writeFileSync(requestsFile, JSON.stringify(clusterRequests, null, 2));
  console.log('✅ Updated cluster request file');
} else {
  console.log('❌ Cluster request not found');
}
