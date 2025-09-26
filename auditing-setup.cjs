const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Enable Database Auditing using Pulumi
 * This is the recommended way to enable auditing programmatically in MongoDB Atlas
 */
async function enableDatabaseAuditingWithPulumi(projectId, publicKey, privateKey) {
  try {
    console.log(`🔍 [AUDITING] Enabling database auditing using Pulumi for project: ${projectId}`);
    
    // Create a temporary Pulumi program
    const pulumiProgram = `
import * as pulumi from "@pulumi/pulumi";
import * as mongodbatlas from "@pulumi/mongodbatlas";

// Initialize the MongoDB Atlas provider
const atlasProvider = new mongodbatlas.Provider("atlas", {
    publicKey: "${publicKey}",
    privateKey: "${privateKey}",
});

// Enable auditing with full configuration
const auditing = new mongodbatlas.Auditing("auditing", {
    projectId: "${projectId}",
    enabled: true,
    auditFilter: "{}", // Empty filter = audit everything
    auditAuthorizationSuccess: true,
}, { provider: atlasProvider });

// Export the auditing configuration ID
export const auditingId = auditing.id;
`;

    // Write the Pulumi program to a temporary file
    const tempDir = path.join(__dirname, 'temp-pulumi');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const pulumiFile = path.join(tempDir, 'index.ts');
    fs.writeFileSync(pulumiFile, pulumiProgram);
    
    // Create Pulumi.yaml
    const pulumiYaml = `name: mongodb-auditing
runtime: nodejs
description: Enable MongoDB Atlas auditing using Pulumi
`;
    fs.writeFileSync(path.join(tempDir, 'Pulumi.yaml'), pulumiYaml);
    
    // Install Pulumi and MongoDB Atlas provider
    const installCommand = `cd ${tempDir} && npm init -y && npm install @pulumi/pulumi @pulumi/mongodbatlas`;
    
    return new Promise((resolve, reject) => {
      exec(installCommand, (error, stdout, stderr) => {
        if (error) {
          console.error('Error installing Pulumi dependencies:', error);
          reject(new Error(`Failed to install Pulumi dependencies: ${error.message}`));
          return;
        }
        
        // Run Pulumi up
        const pulumiCommand = `cd ${tempDir} && npx pulumi up --yes --non-interactive`;
        
        exec(pulumiCommand, (pulumiError, pulumiStdout, pulumiStderr) => {
          if (pulumiError) {
            console.error('Pulumi Error:', pulumiError);
            console.error('Pulumi stderr:', pulumiStderr);
            reject(new Error(`Pulumi execution failed: ${pulumiError.message}`));
            return;
          }
          
          console.log('Pulumi output:', pulumiStdout);
          
          // Clean up temporary files
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.warn('Warning: Could not clean up temporary files:', cleanupError.message);
          }
          
          resolve({
            success: true,
            enabled: true,
            message: 'Database auditing enabled successfully using Pulumi',
            method: 'pulumi'
          });
        });
      });
    });
    
  } catch (error) {
    console.error('❌ [AUDITING] Error enabling database auditing with Pulumi:', error);
    return {
      success: false,
      enabled: false,
      error: error.message,
      message: `Failed to enable database auditing: ${error.message}`
    };
  }
}

module.exports = { enableDatabaseAuditingWithPulumi };
