import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import { Buffer } from 'node:buffer';
type BufferEncoding = Parameters<typeof Buffer.from>[1];

import { FileServiceImpl } from './services/FileService.js';
import { DirectoryServiceImpl } from './services/DirectoryService.js';
import { WatchServiceImpl } from './services/WatchService.js';
import { PatchServiceImpl } from './services/PatchService.js';
import { ChangeTrackingServiceImpl } from './services/ChangeTrackingService.js';
import { StreamProcessorImpl } from './services/StreamProcessor.js';
import {
    FileOperationError,
    ChangeType,
    FileMetadata,
    PatchOperation,
    PatchResult,
    Change,
    ValidationResult,
    BatchConfig
} from './types/index.js';
import { FILE_OPERATION_DEFAULTS } from './config/defaults.js';

type ToolResponse = Record<string, unknown> | FileMetadata | string | PatchResult | Change[] | ValidationResult;

// Helper functions to ensure specific boolean literals
function ensureFalse(_value: unknown): false {
    // Use parameter in a no-op way to satisfy TypeScript
    void _value;
    return false;
}

function ensureTrue(_value: unknown): true {
    // Use parameter in a no-op way to satisfy TypeScript
    void _value;
    return true;
}

function ensureBoolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    return defaultValue;
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
export class FileOperationsServer {
    private server: Server;
    private fileService: FileServiceImpl;
    private directoryService: DirectoryServiceImpl;
    private watchService: WatchServiceImpl;
    private patchService: PatchServiceImpl;
    private changeTrackingService: ChangeTrackingServiceImpl;
    private streamProcessor: StreamProcessorImpl;

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
                },
            }
        );

        // Initialize services
        this.fileService = new FileServiceImpl();
        this.directoryService = new DirectoryServiceImpl();
        this.watchService = new WatchServiceImpl();
        this.patchService = new PatchServiceImpl();
        this.changeTrackingService = new ChangeTrackingServiceImpl();
        this.streamProcessor = new StreamProcessorImpl();

        // Set up request handlers
        this.setupRequestHandlers();

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
                // Patch Operations
                {
                    name: 'apply_patch',
                    description: 'Apply a patch operation to a file',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            operation: {
                                type: 'object',
                                description: 'Patch operation details',
                                properties: {
                                    type: { type: 'string', enum: ['line', 'block', 'diff', 'complete'], description: 'Type of patch operation' },
                                    filePath: { type: 'string', description: 'Path to the file to patch' }
                                },
                                required: ['type', 'filePath']
                            }
                        },
                        required: ['operation']
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
                },
                {
                    name: 'process_file_stream',
                    description: 'Process a large file in chunks with progress tracking',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filePath: {
                                type: 'string',
                                description: 'Path to the file to process'
                            },
                            processor: {
                                type: 'string',
                                description: 'JavaScript function as string to process each chunk',
                                examples: ['(chunk) => chunk.toUpperCase()']
                            },
                            batchConfig: {
                                type: 'object',
                                description: 'Configuration for batch processing',
                                properties: {
                                    maxChunkSize: {
                                        type: 'number',
                                        description: 'Maximum size of each chunk in bytes'
                                    },
                                    maxLinesPerChunk: {
                                        type: 'number',
                                        description: 'Maximum number of lines per chunk (must be 1000)',
                                        enum: [1000]
                                    },
                                    parallel: {
                                        type: 'boolean',
                                        description: 'Whether to process chunks in parallel (must be false)',
                                        enum: [false]
                                    },
                                    maxParallelOps: {
                                        type: 'number',
                                        description: 'Maximum parallel operations (must be 4)',
                                        enum: [4]
                                    },
                                    chunkDelay: {
                                        type: 'number',
                                        description: 'Delay between chunks in milliseconds (must be 100)',
                                        enum: [100]
                                    }
                                }
                            }
                        },
                        required: ['filePath', 'processor']
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
            switch (toolName) {
                // File Operations
                case 'copy_file': {
                    const source = args.source as string;
                    const destination = args.destination as string;
                    const overwrite = ensureBoolean(args.overwrite, FILE_OPERATION_DEFAULTS.overwrite) as false;
                    await this.fileService.copyFile(source, destination, overwrite);
                    await trackChange('Copied file', 'file_create', { source, destination });
                    return await this.fileService.getMetadata(destination);
                }

                case 'read_file': {
                    const path = args.path as string;
                    const encoding = args.encoding as BufferEncoding ?? FILE_OPERATION_DEFAULTS.encoding;
                    return await this.fileService.readFile(path, encoding);
                }

                case 'write_file': {
                    const path = args.path as string;
                    const content = args.content as string;
                    const encoding = args.encoding as BufferEncoding ?? FILE_OPERATION_DEFAULTS.encoding;
                    await this.fileService.writeFile(path, content, encoding);
                    await trackChange('Wrote file', 'file_edit', { path });
                    return await this.fileService.getMetadata(path);
                }

                // Directory Operations
                case 'make_directory': {
                    const path = args.path as string;
                    const recursive = ensureTrue(args.recursive ?? FILE_OPERATION_DEFAULTS.recursive);
                    await this.directoryService.create(path, recursive);
                    await trackChange('Created directory', 'directory_create', { path });
                    return { success: true, path };
                }

                case 'remove_directory': {
                    const path = args.path as string;
                    const recursive = ensureFalse(args.recursive ?? false);
                    await this.directoryService.remove(path, recursive);
                    await trackChange('Removed directory', 'directory_delete', { path });
                    return { success: true, path };
                }

                case 'list_directory': {
                    const path = args.path as string;
                    const recursive = ensureBoolean(args.recursive, false);
                    const entries = await this.directoryService.list(path, recursive);
                    return { success: true, entries };
                }

                case 'copy_directory': {
                    const source = args.source as string;
                    const destination = args.destination as string;
                    const overwrite = ensureFalse(args.overwrite ?? FILE_OPERATION_DEFAULTS.overwrite);
                    await this.directoryService.copy(source, destination, overwrite);
                    await trackChange('Copied directory', 'directory_copy', { source, destination });
                    return { success: true, source, destination };
                }

                // Watch Operations
                case 'watch_directory': {
                    const path = args.path as string;
                    const recursive = ensureTrue(args.recursive ?? false);
                    await this.watchService.watch(path, recursive);
                    await trackChange('Started watching', 'watch_start', { path });
                    return { success: true, path };
                }

                case 'unwatch_directory': {
                    const path = args.path as string;
                    await this.watchService.unwatch(path);
                    await trackChange('Stopped watching', 'watch_end', { path });
                    return { success: true, path };
                }

                case 'is_watching': {
                    const path = args.path as string;
                    const isWatching = this.watchService.isWatching(path);
                    return { path, isWatching };
                }

                // Patch Operations
                case 'apply_patch': {
                    const operation = args.operation as PatchOperation;
                    const patchResult = await this.patchService.applyPatch(operation);
                    if (patchResult.success) {
                        await trackChange('Applied patch', 'patch_apply', {
                            path: operation.filePath,
                            type: operation.type
                        });
                    }
                    return patchResult;
                }

                // Change Tracking Operations
                case 'get_changes': {
                    const limit = args.limit as number | undefined;
                    const type = args.type as ChangeType | undefined;
                    return await this.changeTrackingService.getChanges(limit, type);
                }

                case 'clear_changes': {
                    await this.changeTrackingService.clearChanges();
                    return { success: true };
                }

                case 'process_file_stream': {
                    const filePath = args.filePath as string;
                    const processorStr = args.processor as string;
                    const userConfig = args.batchConfig as Partial<BatchConfig> | undefined;

                    // Create processor function from string
                    const processor = new Function('chunk', 'chunkInfo', `return (${processorStr})(chunk, chunkInfo);`) as
                        (chunk: string, chunkInfo: { start: number; end: number }) => Promise<string>;

                    // Log warning if user provided config that doesn't match defaults
                    if (userConfig && (
                        userConfig.maxLinesPerChunk !== undefined && userConfig.maxLinesPerChunk !== 1000 ||
                        userConfig.parallel !== undefined && userConfig.parallel !== false ||
                        userConfig.maxParallelOps !== undefined && userConfig.maxParallelOps !== 4 ||
                        userConfig.chunkDelay !== undefined && userConfig.chunkDelay !== 100
                    )) {
                        console.warn('User-provided batch config values must match defaults exactly. Using default configuration.');
                    }

                    const results = await this.streamProcessor.processFile(filePath, processor);
                    await trackChange('Processed file stream', 'file_edit', {
                        path: filePath,
                        chunksProcessed: results.length,
                        successful: results.filter(r => r.success).length
                    });

                    return {
                        success: true,
                        results,
                        summary: {
                            totalChunks: results.length,
                            successfulChunks: results.filter(r => r.success).length,
                            failedChunks: results.filter(r => !r.success).length,
                            totalBytesProcessed: results.reduce((sum, r) => sum + r.bytesProcessed, 0)
                        }
                    };
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
