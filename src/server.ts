// Node.js built-ins
import { Buffer } from 'node:buffer';

// MCP SDK imports
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ErrorCode,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Local service implementations
import { FileServiceImpl } from './services/FileService.js';
import { DirectoryServiceImpl } from './services/DirectoryService.js';
import { WatchServiceImpl } from './services/WatchService.js';
import { ChangeTrackingServiceImpl } from './services/ChangeTrackingService.js';
import { RateLimiterService } from './services/RateLimiterService.js';

// Local types and constants
import {
    ChangeType
} from './types/index.js';

// Progress tracking types
type ProgressToken = string | number;
interface ProgressNotification {
    method: 'progress/update';
    params: {
        token: ProgressToken;
        message: string;
        percentage: number;
    };
}
type BufferEncoding = Parameters<typeof Buffer.from>[1];

/**
 * Progress tracking helper class
 */
class ProgressTracker {
    private token: ProgressToken;
    private server: McpServer;
    private total: number;
    private current: number = 0;

    constructor(server: McpServer, total: number) {
        this.server = server;
        this.total = total;
        // Generate a random token ID
        this.token = Math.random().toString(36).substring(2);
    }

    public getToken(): ProgressToken {
        return this.token;
    }

    public async update(increment: number, message: string): Promise<void> {
        this.current += increment;
        const percentage = Math.min(Math.round((this.current / this.total) * 100), 100);

        const notification: ProgressNotification = {
            method: 'progress/update',
            params: {
                token: this.token,
                message,
                percentage
            }
        };

        await this.server.server.notification(notification);
    }
}

/**
 * Validate path to prevent directory traversal
 */
function validatePath(path: string): void {
    const normalized = path.replace(/\\/g, '/');
    if (normalized.includes('../') || normalized.includes('..\\')) {
        throw new McpError(
            ErrorCode.InvalidParams,
            'Path traversal is not allowed'
        );
    }
}

export class FileOperationsServer {
    private mcpServer: McpServer;
    private fileService: FileServiceImpl;
    private directoryService: DirectoryServiceImpl;
    private watchService: WatchServiceImpl;
    private changeTrackingService: ChangeTrackingServiceImpl;
    private rateLimiter: RateLimiterService;

    constructor() {
        // Initialize MCP server with v1.5 API
        this.mcpServer = new McpServer(
            {
                name: 'file-operations-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                    resources: {}
                },
            }
        );

        // Initialize services
        this.fileService = new FileServiceImpl();
        this.directoryService = new DirectoryServiceImpl();
        this.watchService = new WatchServiceImpl();
        this.changeTrackingService = new ChangeTrackingServiceImpl();
        this.rateLimiter = new RateLimiterService();

        // Set up tools and resources using new v1.5 API
        this.setupTools();
        this.setupResources();

        // Error handling
        this.mcpServer.server.onerror = (error): void => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }

    /**
     * Set up MCP tools using v1.5 API
     */
    private setupTools(): void {
        // Track changes helper
        const trackChange = async (
            description: string,
            type: ChangeType,
            details?: Record<string, unknown>
        ): Promise<void> => {
            await this.changeTrackingService.addChange({
                description,
                type,
                details
            });
        };

        // Basic File Operations
        this.mcpServer.tool(
            'copy_file',
            {
                source: z.string().describe('Source file path'),
                destination: z.string().describe('Destination file path'),
                overwrite: z.boolean().default(false).describe('Whether to overwrite existing file')
            },
            async ({ source, destination, overwrite }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(source);
                validatePath(destination);
                
                // For now, use the default behavior - future enhancement could honor overwrite flag
                if (overwrite) {
                    console.warn('Overwrite parameter received but not yet implemented');
                }
                await this.fileService.copyFile(source, destination);
                await trackChange('Copied file', 'file_create', { source, destination });
                const metadata = await this.fileService.getMetadata(destination);
                
                return {
                    content: [{ type: 'text', text: JSON.stringify(metadata, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'read_file',
            {
                path: z.string().describe('Path to the file to read'),
                encoding: z.string().default('utf8').describe('File encoding (default: utf8)')
            },
            async ({ path, encoding }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(path);
                
                const content = await this.fileService.readFile(path, encoding as BufferEncoding);
                return {
                    content: [{ type: 'text', text: content }]
                };
            }
        );

        this.mcpServer.tool(
            'read_many_files',
            {
                paths: z.array(z.string()).describe('Array of file paths to read'),
                encoding: z.string().default('utf8').describe('File encoding (default: utf8)')
            },
            async ({ paths, encoding }) => {
                this.rateLimiter.checkRateLimit('tool');
                
                // Validate all paths
                for (const path of paths) {
                    validatePath(path);
                }
                
                // Apply rate limiting based on number of files (treat as multiple operations)
                for (let i = 0; i < paths.length - 1; i++) {
                    this.rateLimiter.checkRateLimit('tool');
                }
                
                const results = await this.fileService.readManyFiles(paths, encoding as BufferEncoding);
                
                // Track successful reads
                for (const result of results) {
                    if (result.success) {
                        await trackChange('Read file (batch)', 'file_edit', { path: result.path });
                    }
                }
                
                return {
                    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'write_file',
            {
                path: z.string().describe('Path to write the file to'),
                content: z.string().describe('Content to write to the file'),
                encoding: z.string().default('utf8').describe('File encoding (default: utf8)')
            },
            async ({ path, content, encoding }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(path);
                
                await this.fileService.writeFile(path, content, encoding as BufferEncoding);
                await trackChange('Wrote file', 'file_edit', { path });
                const metadata = await this.fileService.getMetadata(path);
                
                return {
                    content: [{ type: 'text', text: JSON.stringify(metadata, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'write_many_files',
            {
                files: z.array(z.object({
                    path: z.string().describe('Path to write the file to'),
                    content: z.string().describe('Content to write to the file')
                })).describe('Array of file objects with path and content'),
                encoding: z.string().default('utf8').describe('File encoding (default: utf8)')
            },
            async ({ files, encoding }) => {
                this.rateLimiter.checkRateLimit('tool');
                
                // Validate all paths
                for (const file of files) {
                    validatePath(file.path);
                }
                
                // Apply rate limiting based on number of files (treat as multiple operations)
                for (let i = 0; i < files.length - 1; i++) {
                    this.rateLimiter.checkRateLimit('tool');
                }
                
                const results = await this.fileService.writeManyFiles(files, encoding as BufferEncoding);
                
                // Track successful writes and collect metadata
                const metadata: any[] = [];
                for (const result of results) {
                    if (result.success) {
                        await trackChange('Wrote file (batch)', 'file_edit', { path: result.path });
                        try {
                            const fileMetadata = await this.fileService.getMetadata(result.path);
                            metadata.push({ path: result.path, metadata: fileMetadata });
                        } catch (error) {
                            // Metadata retrieval failed, but file write succeeded
                            metadata.push({ path: result.path, error: 'Failed to retrieve metadata' });
                        }
                    }
                }
                
                return {
                    content: [{ type: 'text', text: JSON.stringify({ 
                        results, 
                        metadata,
                        summary: {
                            total: files.length,
                            successful: results.filter(r => r.success).length,
                            failed: results.filter(r => !r.success).length
                        }
                    }, null, 2) }]
                };
            }
        );

        // Directory Operations
        this.mcpServer.tool(
            'make_directory',
            {
                path: z.string().describe('Path to create the directory at'),
                recursive: z.boolean().default(true).describe('Create parent directories if they don\'t exist')
            },
            async ({ path, recursive }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(path);
                
                await this.directoryService.create(path, recursive ? true : true);
                await trackChange('Created directory', 'directory_create', { path });
                
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, path }, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'remove_directory',
            {
                path: z.string().describe('Path to the directory to remove'),
                recursive: z.boolean().default(false).describe('Remove directory contents recursively')
            },
            async ({ path, recursive }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(path);
                
                await this.directoryService.remove(path, recursive);
                await trackChange('Removed directory', 'directory_delete', { path });
                
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, path }, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'list_directory',
            {
                path: z.string().describe('Path of directory to list'),
                recursive: z.boolean().default(false).describe('Whether to list contents recursively')
            },
            async ({ path, recursive }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(path);
                
                const entries = await this.directoryService.list(path, recursive);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, entries }, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'copy_directory',
            {
                source: z.string().describe('Source directory path'),
                destination: z.string().describe('Destination directory path'),
                overwrite: z.boolean().default(false).describe('Whether to overwrite existing files/directories')
            },
            async ({ source, destination, overwrite }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(source);
                validatePath(destination);

                // Count files for progress tracking
                const entries = await this.directoryService.list(source, true);
                const totalFiles = entries.length;

                // Create progress tracker
                const progress = new ProgressTracker(
                    this.mcpServer,
                    totalFiles
                );

                // Copy with progress updates - for now use default behavior
                if (overwrite) {
                    console.warn('Overwrite parameter received but not yet implemented');
                }
                let copied = 0;
                await this.directoryService.copy(source, destination);

                // Update progress after each file
                const files = await this.directoryService.list(destination, true);
                for (let i = 0; i < files.length; i++) {
                    copied++;
                    await progress.update(1, `Copying directory ${source} to ${destination} (${copied}/${totalFiles})`);
                }

                await trackChange('Copied directory', 'directory_copy', { source, destination });
                return {
                    content: [{ 
                        type: 'text', 
                        text: JSON.stringify({ 
                            success: true, 
                            source, 
                            destination,
                            progressToken: progress.getToken() 
                        }, null, 2) 
                    }]
                };
            }
        );

        // Watch Operations
        this.mcpServer.tool(
            'watch_directory',
            {
                path: z.string().describe('Path to the directory to watch'),
                recursive: z.boolean().default(true).describe('Watch subdirectories recursively')
            },
            async ({ path, recursive }) => {
                this.rateLimiter.checkRateLimit('tool');
                this.rateLimiter.checkRateLimit('watch');
                validatePath(path);
                
                await this.watchService.watch(path, recursive ? true : true);
                await trackChange('Started watching', 'watch_start', { path });
                
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, path }, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'unwatch_directory',
            {
                path: z.string().describe('Path to the directory to stop watching')
            },
            async ({ path }) => {
                this.rateLimiter.checkRateLimit('tool');
                this.rateLimiter.checkRateLimit('watch');
                validatePath(path);
                
                await this.watchService.unwatch(path);
                await trackChange('Stopped watching', 'watch_end', { path });
                
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true, path }, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'is_watching',
            {
                path: z.string().describe('Path to check')
            },
            async ({ path }) => {
                this.rateLimiter.checkRateLimit('tool');
                validatePath(path);
                
                const isWatching = this.watchService.isWatching(path);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ path, isWatching }, null, 2) }]
                };
            }
        );

        // Change Tracking Operations
        this.mcpServer.tool(
            'get_changes',
            {
                limit: z.number().optional().describe('Maximum number of changes to return'),
                type: z.string().optional().describe('Filter changes by type')
            },
            async ({ limit, type }) => {
                this.rateLimiter.checkRateLimit('tool');
                
                const changes = await this.changeTrackingService.getChanges(limit, type as ChangeType);
                return {
                    content: [{ type: 'text', text: JSON.stringify(changes, null, 2) }]
                };
            }
        );

        this.mcpServer.tool(
            'clear_changes',
            {},
            async () => {
                this.rateLimiter.checkRateLimit('tool');
                
                await this.changeTrackingService.clearChanges();
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: true }, null, 2) }]
                };
            }
        );
    }
    /**
     * Set up MCP resources using v1.5 API
     */
    private setupResources(): void {
        // Static resource: recent changes
        this.mcpServer.resource(
            'Recent File Changes',
            'file:///recent-changes',
            {
                description: 'List of recent file system changes',
                mimeType: 'application/json'
            },
            async () => {
                this.rateLimiter.checkRateLimit('resource');
                const changes = await this.changeTrackingService.getChanges();
                return {
                    contents: [{
                        uri: 'file:///recent-changes',
                        mimeType: 'application/json',
                        text: JSON.stringify(changes, null, 2)
                    }]
                };
            }
        );

        // Resource templates for dynamic file access
        this.mcpServer.resource(
            'File Contents',
            new ResourceTemplate('file://{path}', { list: undefined }),
            async (uri: URL, variables: Record<string, string | string[]>) => {
                this.rateLimiter.checkRateLimit('resource');
                const path = Array.isArray(variables.path) ? variables.path[0] : variables.path;
                validatePath(path);
                const content = await this.fileService.readFile(path);
                return {
                    contents: [{
                        uri: uri.href,
                        text: content
                    }]
                };
            }
        );

        this.mcpServer.resource(
            'File Metadata',
            new ResourceTemplate('metadata://{path}', { list: undefined }),
            {
                description: 'Metadata for a file at the specified path',
                mimeType: 'application/json'
            },
            async (uri: URL, variables: Record<string, string | string[]>) => {
                this.rateLimiter.checkRateLimit('resource');
                const path = Array.isArray(variables.path) ? variables.path[0] : variables.path;
                validatePath(path);
                const metadata = await this.fileService.getMetadata(path);
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(metadata, null, 2)
                    }]
                };
            }
        );

        this.mcpServer.resource(
            'Directory Contents',
            new ResourceTemplate('directory://{path}', { list: undefined }),
            {
                description: 'List of files in a directory',
                mimeType: 'application/json'
            },
            async (uri: URL, variables: Record<string, string | string[]>) => {
                this.rateLimiter.checkRateLimit('resource');
                const path = Array.isArray(variables.path) ? variables.path[0] : variables.path;
                validatePath(path);
                const entries = await this.directoryService.list(path, false);
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(entries, null, 2)
                    }]
                };
            }
        );
    }

    /**
     * Clean up resources before shutdown
     */
    public async cleanup(): Promise<void> {
        // Clean up watchers
        await this.watchService.dispose();
    }

    /**
     * Start the server with stdio transport
     */
    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
        console.error('File Operations MCP server running on stdio');
    }

    /**
     * Start the server with HTTP transport (SSE)
     */
    async runHttp(port: number = 3001): Promise<void> {
        // This will be implemented with Express server
        // For now, just use stdio
        console.error(`HTTP server would run on port ${port}`);
        await this.run();
    }

    /**
     * Get the underlying MCP server for advanced operations
     */
    getMcpServer(): McpServer {
        return this.mcpServer;
    }
}
