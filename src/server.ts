import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
    McpError
} from '@modelcontextprotocol/sdk/types.js';

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
import { Buffer } from 'node:buffer';
type BufferEncoding = Parameters<typeof Buffer.from>[1];

import { FileServiceImpl } from './services/FileService.js';
import { DirectoryServiceImpl } from './services/DirectoryService.js';
import { WatchServiceImpl } from './services/WatchService.js';
import { ChangeTrackingServiceImpl } from './services/ChangeTrackingService.js';
import { RateLimiterService } from './services/RateLimiterService.js';
import {
    FileOperationError,
    ChangeType,
    FileMetadata,
    Change,
    ValidationResult
} from './types/index.js';
import { FILE_OPERATION_DEFAULTS } from './config/defaults.js';

type ToolResponse = {
    result: Record<string, unknown> | FileMetadata | string | Change[] | ValidationResult;
    progressToken?: ProgressToken;
};

interface ProgressUpdate {
    message: string;
    percentage: number;
}

/**
 * Progress tracking helper class
 */
class ProgressTracker {
    private token: ProgressToken;
    private server: Server;
    private total: number;
    private current: number = 0;

    constructor(server: Server, total: number, description: string) {
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

        await this.server.notification(notification);
    }
}

/**
 * Helper function to ensure boolean values with defaults
 * @param value Value to check
 * @param defaultValue Default value if not boolean
 * @returns Validated boolean value
 */
function ensureBoolean(value: unknown, defaultValue: boolean): boolean {
    return typeof value === 'boolean' ? value : defaultValue;
}

/**
 * Main server class coordinating all file operation services
 * Follows SOLID principles:
 * - Single Responsibility: Coordinates services and handles MCP communication
 * - Open/Closed: Extensible through service implementations
 * - Liskov Substitution: Services follow their interfaces
 * - Interface Segregation: Each service has focused responsibilities
 * - Dependency Inversion: Depends on service abstractions
 */
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
    private server: Server;
    private fileService: FileServiceImpl;
    private directoryService: DirectoryServiceImpl;
    private watchService: WatchServiceImpl;
    private changeTrackingService: ChangeTrackingServiceImpl;
    private rateLimiter: RateLimiterService;

    constructor() {
        // Initialize server
        this.server = new Server(
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

        // Set up request handlers
        this.setupRequestHandlers();
        this.setupResourceHandlers();

        // Error handling
        this.server.onerror = (error): void => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }

    /**
     * Set up MCP request handlers
     */
    private setupRequestHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                // Basic File Operations
                {
                    name: 'copy_file',
                    description: 'Copy a file to a new location',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            source: { type: 'string', description: 'Source file path' },
                            destination: { type: 'string', description: 'Destination file path' },
                            overwrite: { type: 'boolean', description: 'Whether to overwrite existing file', default: false }
                        },
                        required: ['source', 'destination']
                    }
                },
                {
                    name: 'read_file',
                    description: 'Read the contents of a file',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to the file to read' },
                            encoding: { type: 'string', description: 'File encoding (default: utf8)', default: 'utf8' }
                        },
                        required: ['path']
                    }
                },
                {
                    name: 'write_file',
                    description: 'Write content to a file',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to write the file to' },
                            content: { type: 'string', description: 'Content to write to the file' },
                            encoding: { type: 'string', description: 'File encoding (default: utf8)', default: 'utf8' }
                        },
                        required: ['path', 'content']
                    }
                },
                // Directory Operations
                {
                    name: 'make_directory',
                    description: 'Create a new directory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to create the directory at' },
                            recursive: { type: 'boolean', description: 'Create parent directories if they don\'t exist', default: true }
                        },
                        required: ['path']
                    }
                },
                {
                    name: 'remove_directory',
                    description: 'Remove a directory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to the directory to remove' },
                            recursive: { type: 'boolean', description: 'Remove directory contents recursively', default: false }
                        },
                        required: ['path']
                    }
                },
                {
                    name: 'list_directory',
                    description: 'List contents of a directory with detailed metadata',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path of directory to list' },
                            recursive: { type: 'boolean', description: 'Whether to list contents recursively', default: false }
                        },
                        required: ['path']
                    }
                },
                {
                    name: 'copy_directory',
                    description: 'Copy a directory and its contents to a new location',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            source: { type: 'string', description: 'Source directory path' },
                            destination: { type: 'string', description: 'Destination directory path' },
                            overwrite: { type: 'boolean', description: 'Whether to overwrite existing files/directories', default: false }
                        },
                        required: ['source', 'destination']
                    }
                },
                // Watch Operations
                {
                    name: 'watch_directory',
                    description: 'Watch a directory for changes',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to the directory to watch' },
                            recursive: { type: 'boolean', description: 'Watch subdirectories recursively', default: false }
                        },
                        required: ['path']
                    }
                },
                {
                    name: 'unwatch_directory',
                    description: 'Stop watching a directory',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to the directory to stop watching' }
                        },
                        required: ['path']
                    }
                },
                {
                    name: 'is_watching',
                    description: 'Check if a path is currently being watched',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Path to check' }
                        },
                        required: ['path']
                    }
                },
                // Change Tracking Operations
                {
                    name: 'get_changes',
                    description: 'Get list of tracked changes',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            limit: { type: 'number', description: 'Maximum number of changes to return' },
                            type: { type: 'string', description: 'Filter changes by type' }
                        }
                    }
                },
                {
                    name: 'clear_changes',
                    description: 'Clear all tracked changes',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                }
            ],
        }));

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<{
            content: Array<{ type: string; text: string }>;
            isError?: boolean;
        }> => {
            try {
                // Check rate limit before processing tool request
                this.rateLimiter.checkRateLimit('tool');

                const result = await this.handleToolCall(
                    request.params.name,
                    request.params.arguments as Record<string, unknown>
                );
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                };
            } catch (error) {
                if (error instanceof FileOperationError) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `File operation error: ${error.message} (${error.code})`,
                            },
                        ],
                        isError: true,
                    };
                }
                throw error;
            }
        });
    }

    /**
     * Handle tool calls by delegating to appropriate service
     * @param toolName Name of the tool to execute
     * @param args Tool arguments
     */
    private async handleToolCall(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<ToolResponse> {
        // Track the change
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

        try {
            // Additional rate limit check for watch operations
            if (toolName.includes('watch')) {
                this.rateLimiter.checkRateLimit('watch');
            }

            switch (toolName) {
                // File Operations
                case 'copy_file': {
                    const source = args.source as string;
                    const destination = args.destination as string;
                    const overwrite = ensureBoolean(args.overwrite, FILE_OPERATION_DEFAULTS.overwrite) as false;
                    await this.fileService.copyFile(source, destination, overwrite);
                    await trackChange('Copied file', 'file_create', { source, destination });
                    const metadata = await this.fileService.getMetadata(destination);
                    return { result: metadata };
                }

                case 'read_file': {
                    const path = args.path as string;
                    const encoding = args.encoding as BufferEncoding ?? FILE_OPERATION_DEFAULTS.encoding;
                    const content = await this.fileService.readFile(path, encoding);
                    return { result: content };
                }

                case 'write_file': {
                    const path = args.path as string;
                    const content = args.content as string;
                    const encoding = args.encoding as BufferEncoding ?? FILE_OPERATION_DEFAULTS.encoding;
                    await this.fileService.writeFile(path, content, encoding);
                    await trackChange('Wrote file', 'file_edit', { path });
                    const metadata = await this.fileService.getMetadata(path);
                    return { result: metadata };
                }

                // Directory Operations
                case 'make_directory': {
                    const path = args.path as string;
                    const recursive = ensureBoolean(args.recursive, true);
                    await this.directoryService.create(path, recursive as true);
                    await trackChange('Created directory', 'directory_create', { path });
                    return { result: { success: true, path } };
                }

                case 'remove_directory': {
                    const path = args.path as string;
                    const recursive = ensureBoolean(args.recursive, false);
                    await this.directoryService.remove(path, recursive);
                    await trackChange('Removed directory', 'directory_delete', { path });
                    return { result: { success: true, path } };
                }

                case 'list_directory': {
                    const path = args.path as string;
                    const recursive = ensureBoolean(args.recursive, false);
                    const entries = await this.directoryService.list(path, recursive);
                    return { result: { success: true, entries } };
                }

                case 'copy_directory': {
                    const source = args.source as string;
                    const destination = args.destination as string;
                    const overwrite = ensureBoolean(args.overwrite, FILE_OPERATION_DEFAULTS.overwrite) as false;

                    // Validate paths
                    validatePath(source);
                    validatePath(destination);

                    // Count files for progress tracking
                    const entries = await this.directoryService.list(source, true);
                    const totalFiles = entries.length;

                    // Create progress tracker
                    const progress = new ProgressTracker(
                        this.server,
                        totalFiles,
                        `Copying directory ${source} to ${destination}`
                    );

                    // Copy with progress updates
                    let copied = 0;
                    await this.directoryService.copy(source, destination, overwrite);

                    // Update progress after each file
                    const files = await this.directoryService.list(destination, true);
                    files.forEach(async (file) => {
                        copied++;
                        await progress.update(1, `Copying ${file}`);
                    });

                    await trackChange('Copied directory', 'directory_copy', { source, destination });
                    return {
                        result: { success: true, source, destination },
                        progressToken: progress.getToken()
                    };
                }

                // Watch Operations
                case 'watch_directory': {
                    const path = args.path as string;
                    const recursive = ensureBoolean(args.recursive, true) as true;
                    await this.watchService.watch(path, recursive);
                    await trackChange('Started watching', 'watch_start', { path });
                    return { result: { success: true, path } };
                }

                case 'unwatch_directory': {
                    const path = args.path as string;
                    await this.watchService.unwatch(path);
                    await trackChange('Stopped watching', 'watch_end', { path });
                    return { result: { success: true, path } };
                }

                case 'is_watching': {
                    const path = args.path as string;
                    const isWatching = this.watchService.isWatching(path);
                    return { result: { path, isWatching } };
                }

                // Change Tracking Operations
                case 'get_changes': {
                    const limit = args.limit as number | undefined;
                    const type = args.type as ChangeType | undefined;
                    const changes = await this.changeTrackingService.getChanges(limit, type);
                    return { result: changes };
                }

                case 'clear_changes': {
                    await this.changeTrackingService.clearChanges();
                    return { result: { success: true } };
                }

                default:
                    throw new McpError(
                        ErrorCode.MethodNotFound,
                        `Unknown tool: ${toolName}`
                    );
            }
        } catch (error) {
            if (error instanceof FileOperationError) throw error;
            throw new McpError(
                ErrorCode.InternalError,
                `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Set up MCP resource handlers
     */
    private setupResourceHandlers(): void {
        // List available resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: [
                {
                    uri: 'file:///recent-changes',
                    name: 'Recent File Changes',
                    description: 'List of recent file system changes',
                    mimeType: 'application/json'
                }
            ]
        }));

        // List resource templates
        this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
            resourceTemplates: [
                {
                    uriTemplate: 'file://{path}',
                    name: 'File Contents',
                    description: 'Contents of a file at the specified path'
                },
                {
                    uriTemplate: 'metadata://{path}',
                    name: 'File Metadata',
                    description: 'Metadata for a file at the specified path',
                    mimeType: 'application/json'
                },
                {
                    uriTemplate: 'directory://{path}',
                    name: 'Directory Contents',
                    description: 'List of files in a directory',
                    mimeType: 'application/json'
                }
            ]
        }));

        // Read resources
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            // Check rate limit before processing resource request
            this.rateLimiter.checkRateLimit('resource');

            const uri = request.params.uri;

            // Handle static resources
            if (uri === 'file:///recent-changes') {
                const changes = await this.changeTrackingService.getChanges();
                return {
                    contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(changes, null, 2)
                    }]
                };
            }

            // Handle dynamic resources
            if (uri.startsWith('file://')) {
                const path = decodeURIComponent(uri.slice(7));
                validatePath(path);
                const content = await this.fileService.readFile(path);
                return {
                    contents: [{
                        uri,
                        text: content
                    }]
                };
            }

            if (uri.startsWith('metadata://')) {
                const path = decodeURIComponent(uri.slice(11));
                validatePath(path);
                const metadata = await this.fileService.getMetadata(path);
                return {
                    contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(metadata, null, 2)
                    }]
                };
            }

            if (uri.startsWith('directory://')) {
                const path = decodeURIComponent(uri.slice(11));
                validatePath(path);
                const entries = await this.directoryService.list(path, false);
                return {
                    contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(entries, null, 2)
                    }]
                };
            }

            throw new McpError(
                ErrorCode.InvalidRequest,
                `Invalid resource URI: ${uri}`
            );
        });
    }

    /**
     * Clean up resources before shutdown
     */
    public async cleanup(): Promise<void> {
        // Clean up watchers
        await this.watchService.dispose();
    }

    /**
     * Start the server
     */
    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('File Operations MCP server running on stdio');
    }
}
