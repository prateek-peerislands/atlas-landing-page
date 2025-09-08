import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import pgPkg from 'pg';
const { Client: PgClient } = pgPkg;
async function main() {
    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl) {
        console.error('POSTGRES_URL is required');
        process.exit(1);
    }
    const pg = new PgClient({ connectionString: postgresUrl });
    await pg.connect();
    const tools = [
        {
            name: 'postgres.run_sql',
            description: 'Run parameterized SQL against PostgreSQL',
            inputSchema: z.object({ sql: z.string(), params: z.array(z.any()).optional() }),
            handler: async (args) => {
                const sql = args?.sql;
                const params = Array.isArray(args?.params) ? args.params : [];
                const result = await pg.query(sql, params);
                return {
                    rows: result.rows,
                    rowCount: result.rowCount,
                    fields: (result.fields || []).map((f) => f.name)
                };
            }
        },
        {
            name: 'postgres.describe_schema',
            description: 'List tables and columns in the public schema',
            inputSchema: z.object({}),
            handler: async () => {
                const res = await pg.query(`
          select table_name, column_name, data_type
          from information_schema.columns
          where table_schema = 'public'
          order by table_name, ordinal_position
        `);
                return res.rows;
            }
        }
    ];
    const server = new Server({ name: 'postgres-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
        }))
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
