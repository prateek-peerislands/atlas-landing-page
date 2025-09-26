import 'dotenv/config';
import OpenAI from 'openai';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
};

async function connectMcp(command: string, args: string[] = [], env?: Record<string, string | undefined>) {
  const client = new McpClient(
    { name: 'agent-client', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );
  await client.connect(new StdioClientTransport({ command, args, env: { ...process.env, ...env } as any }));
  return client;
}

async function listToolsForLlm(client: McpClient): Promise<ToolDef[]> {
  const catalog = await client.listTools();
  return catalog.tools.map((t: any) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object' }
    }
  }));
}

export async function suggestClusterTier(requirements: any) {
  const openai = new OpenAI({ 
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
    defaultQuery: { 'api-version': '2024-02-15-preview' },
    defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
  });

  const systemPrompt = `You are an expert MongoDB Atlas cluster tier recommendation system. 
  Analyze the developer's requirements and suggest the optimal cluster tier based on:
  - Environment type (production/development/testing)
  - Data volume expectations
  - Concurrent user count
  - Query complexity
  - Performance requirements
  - Geographic region
  - Backup and security needs

  Available MongoDB Atlas cluster tiers (ACTUALLY VALID in Atlas API):
  - M10: 2 vCPUs, 2GB RAM, 10GB storage - $57/month (Development, small apps) - Azure
  - M20: 2 vCPUs, 4GB RAM, 20GB storage - $147/month (Medium applications) - Azure  
  - M30: 2 vCPUs, 8GB RAM, 40GB storage - $388/month (Production, high traffic) - Azure

  Respond with a JSON object containing:
  {
    "tier": "M20",
    "name": "Medium",
    "vcpus": 4,
    "ram": 8,
    "storage": "20 GB",
    "reasoning": ["Reason 1", "Reason 2", "Reason 3"],
    "confidence": 85,
    "estimatedCost": "$25/month",
    "features": ["Feature 1", "Feature 2", "Feature 3"]
  }`;

  const userPrompt = `Analyze these requirements and suggest the optimal MongoDB Atlas cluster tier:
  Environment: ${requirements.environment}
  Data Volume: ${requirements.dataVolume}
  Concurrent Users: ${requirements.concurrentUsers}
  Query Complexity: ${requirements.queryComplexity}
  Performance Requirements: ${requirements.performanceRequirements}
  Geographic Region: ${requirements.geographicRegion || 'Not specified'}`;

  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  });

  const content = response.choices[0].message.content;
  console.log('Azure OpenAI response content:', content);
  
  try {
    // Handle markdown code blocks (```json ... ```)
    let jsonContent = content || '{}';
    if (jsonContent.includes('```json')) {
      const jsonMatch = jsonContent.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
    }
    
    const parsed = JSON.parse(jsonContent);
    console.log('Parsed JSON:', parsed);
    return parsed;
  } catch (error) {
    console.log('JSON parsing error:', error);
    console.log('Raw content:', content);
    // Fallback if JSON parsing fails
    return {
      tier: 'M20',
      name: 'Medium',
      vcpus: 2,
      ram: 4,
      storage: '20 GB',
      reasoning: ['AI analysis completed but response format was unexpected'],
      confidence: 70,
      estimatedCost: '$146.72/month',
      features: ['Standard MongoDB Atlas features']
    };
  }
}

export async function askMigrationAgent(prompt: string) {
  const openai = new OpenAI({ 
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
    defaultQuery: { 'api-version': '2024-02-15-preview' },
    defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
  });

  const mongodbUri = process.env.MONGODB_URI;
  const postgresUrl = process.env.POSTGRES_URL;
  if (!mongodbUri || !postgresUrl) {
    throw new Error('Missing MONGODB_URI or POSTGRES_URL');
  }

  // Connect to MCP servers with per-request connection strings
  const mongo = await connectMcp('node', ['dist/mcp/mongo-data-mcp-server.js'], { MONGODB_URI: mongodbUri });
  const pg = await connectMcp('node', ['dist/mcp/postgres-mcp-server.js'], { POSTGRES_URL: postgresUrl });

  const allMongoTools = await listToolsForLlm(mongo);
  const pgTools = await listToolsForLlm(pg);

  const mode = (process.env.AGENT_MODE || 'execute').toLowerCase();
  // In validate mode, expose only read-only tools
  const mongoReadOnlyTools = allMongoTools.filter(t => {
    const name = t.function.name;
    return name === 'mongo.list_collections' || name === 'mongo.get_indexes';
  });
  const mongoWriteTools = allMongoTools.filter(t => !mongoReadOnlyTools.some(r => r.function.name === t.function.name));
  const tools = mode === 'validate' ? [...pgTools, ...mongoReadOnlyTools] : [...pgTools, ...allMongoTools];

  const messages: any[] = [
    { role: 'system', content: mode === 'validate'
      ? 'You are validating a PostgreSQL→MongoDB migration. Use ONLY read-only tools. Fetch schema and suggest a mapping. Respond ONLY with a single JSON object with keys: summary, mapping[], transformRules, indexPlan[], risks[], dryRunSamples{}. Do not include prose.'
      : 'You are a migration agent that moves data from PostgreSQL to MongoDB via MCP tools. Never access databases directly; always use tools. Plan briefly, then execute.' },
    { role: 'user', content: prompt }
  ];

  for (let step = 0; step < 8; step++) {
    const res = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
      messages,
      tools
    } as any);

    const msg: any = res.choices[0].message;
    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const name = call.function.name as string;
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        const client = name.startsWith('postgres.') ? pg : mongo;
        const output = await client.callTool({ name, arguments: args });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
      }
      continue;
    }

    if (msg.content) {
      // If validate mode, try to persist a plan report
      if (mode === 'validate') {
        const fs = await import('fs');
        const path = await import('path');
        const planId = `val-${Date.now()}`;
        let report: any;
        try {
          report = JSON.parse(msg.content);
        } catch {
          report = { summary: msg.content };
        }
        report.planId = report.planId || planId;
        const dir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, `${report.planId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        return JSON.stringify({ ok: true, planId: report.planId, report });
      }
      // Execute mode just return final text
      return msg.content as string;
    }
  }

  return 'Unable to complete migration with available tools.';
}

// CLI usage: node dist/index.js "Migrate table public.users to MongoDB db app, collection users"
if (process.argv[2]) {
  askMigrationAgent(process.argv.slice(2).join(' ')).then((out) => {
    console.log(out);
    process.exit(0);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}


