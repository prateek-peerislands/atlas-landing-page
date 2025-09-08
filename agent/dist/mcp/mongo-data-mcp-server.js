import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
async function main() {
    const mongoUrl = process.env.MONGODB_URI;
    if (!mongoUrl) {
        console.error('MONGODB_URI is required');
        process.exit(1);
    }
    const client = new MongoClient(mongoUrl);
    await client.connect();
    const tools = [
        {
            name: 'mongo.insert_many',
            description: 'Insert many documents into a collection',
            inputSchema: z.object({
                db: z.string(),
                collection: z.string(),
                docs: z.array(z.record(z.any()))
            }),
            handler: async (args) => {
                const db = args.db;
                const collection = args.collection;
                const docs = args.docs;
                const res = await client.db(db).collection(collection).insertMany(docs);
                return { insertedCount: res.insertedCount };
            }
        },
        {
            name: 'mongo.create_index',
            description: 'Create an index on a collection',
            inputSchema: z.object({
                db: z.string(),
                collection: z.string(),
                keys: z.record(z.number())
            }),
            handler: async (args) => {
                const db = args.db;
                const collection = args.collection;
                const keys = args.keys;
                const name = await client.db(db).collection(collection).createIndex(keys);
                return { name };
            }
        },
        {
            name: 'mongo.list_collections',
            description: 'List collection names in a database',
            inputSchema: z.object({ db: z.string() }),
            handler: async (args) => {
                const db = args.db;
                const names = await client.db(db).listCollections().toArray();
                return names.map((c) => c.name);
            }
        },
        {
            name: 'mongo.get_indexes',
            description: 'List indexes for a collection',
            inputSchema: z.object({ db: z.string(), collection: z.string() }),
            handler: async (args) => {
                const db = args.db;
                const collection = args.collection;
                const indexes = await client.db(db).collection(collection).indexes();
                return indexes;
            }
        }
    ];
    const server = new Server({ name: 'mongo-data-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
    }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const name = req.params.name;
        const tool = tools.find((t) => t.name === name);
        if (!tool) {
            return { content: [{ type: 'text', text: `Tool not found: ${name}` }], isError: true };
        }
        const result = await tool.handler(req.params.arguments || {});
        return { content: [{ type: 'json', json: result }] };
    });
    await server.connect(new StdioServerTransport());
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
