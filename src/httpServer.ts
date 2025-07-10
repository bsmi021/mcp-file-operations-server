import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { FileOperationsServer } from './server.js';

/**
 * HTTP server implementation with SSE support for the MCP File Operations Server
 * Provides a streamable HTTP interface as per MCP SDK v1.5
 */
export class FileOperationsHttpServer {
    private app: express.Application;
    private fileOpsServer: FileOperationsServer;
    private transports: Map<string, SSEServerTransport> = new Map();

    constructor() {
        this.app = express();
        this.fileOpsServer = new FileOperationsServer();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        // Parse JSON bodies
        this.app.use(express.json());
        
        // CORS headers for cross-origin requests
        this.app.use((_req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            next();
        });

        // Handle preflight requests
        this.app.options('*', (_req, res) => {
            res.sendStatus(200);
        });
    }

    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('/health', (_req, res) => {
            res.json({ 
                status: 'healthy', 
                service: 'mcp-file-operations-server',
                version: '1.0.0',
                transport: 'http-sse'
            });
        });

        // SSE endpoint for establishing the MCP connection
        this.app.get('/sse', async (_req, res) => {
            try {
                const transport = new SSEServerTransport('/messages', res);
                
                // Store transport for routing messages
                this.transports.set(transport.sessionId, transport);
                
                // Set up cleanup when connection closes
                transport.onclose = () => {
                    this.transports.delete(transport.sessionId);
                    console.error(`SSE connection closed for session ${transport.sessionId}`);
                };

                transport.onerror = (error) => {
                    this.transports.delete(transport.sessionId);
                    console.error(`SSE connection error for session ${transport.sessionId}:`, error);
                };

                // Connect the MCP server to this transport
                await this.fileOpsServer.getMcpServer().connect(transport);
                
                console.error(`SSE connection established for session ${transport.sessionId}`);
            } catch (error) {
                console.error('Error establishing SSE connection:', error);
                res.status(500).json({ error: 'Failed to establish SSE connection' });
            }
        });

        // Message endpoint for receiving client messages
        this.app.post('/messages', async (req, res) => {
            try {
                // Extract session ID from request (could be from headers, query params, or body)
                const sessionId = req.headers['x-session-id'] as string || 
                                req.query.sessionId as string ||
                                req.body?.sessionId;

                if (!sessionId) {
                    res.status(400).json({ error: 'Session ID required' });
                    return;
                }

                const transport = this.transports.get(sessionId);
                if (!transport) {
                    res.status(404).json({ error: 'Session not found' });
                    return;
                }

                // Handle the message through the transport
                await transport.handlePostMessage(req, res, req.body);
            } catch (error) {
                console.error('Error handling message:', error);
                res.status(500).json({ error: 'Failed to handle message' });
            }
        });

        // List active sessions (for debugging)
        this.app.get('/sessions', (_req, res) => {
            const sessions = Array.from(this.transports.keys());
            res.json({ 
                activeSessions: sessions.length,
                sessions: sessions 
            });
        });
    }

    /**
     * Start the HTTP server
     */
    async start(port: number = 3001): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.app.listen(port, () => {
                    console.error(`File Operations MCP HTTP server running on port ${port}`);
                    console.error(`SSE endpoint: http://localhost:${port}/sse`);
                    console.error(`Messages endpoint: http://localhost:${port}/messages`);
                    console.error(`Health check: http://localhost:${port}/health`);
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop the HTTP server and clean up connections
     */
    async stop(): Promise<void> {
        // Close all active transports
        for (const transport of this.transports.values()) {
            try {
                await transport.close();
            } catch (error) {
                console.error('Error closing transport:', error);
            }
        }
        this.transports.clear();

        // Clean up the file operations server
        await this.fileOpsServer.cleanup();
    }

    /**
     * Get the underlying Express app for advanced configuration
     */
    getApp(): express.Application {
        return this.app;
    }
}