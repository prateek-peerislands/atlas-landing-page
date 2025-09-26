
import * as pulumi from "@pulumi/pulumi";
import * as mongodbatlas from "@pulumi/mongodbatlas";

// Initialize the MongoDB Atlas provider
const atlasProvider = new mongodbatlas.Provider("atlas", {
    publicKey: "vcammlal",
    privateKey: "d94cc8c6-3c3c-496f-b53f-94726270eb90",
});

// Enable auditing with full configuration
const auditing = new mongodbatlas.Auditing("auditing", {
    projectId: "688ba44a7f3cd609ef39f683",
    enabled: true,
    auditFilter: "{}", // Empty filter = audit everything
    auditAuthorizationSuccess: true,
}, { provider: atlasProvider });

// Export the auditing configuration ID
export const auditingId = auditing.id;
