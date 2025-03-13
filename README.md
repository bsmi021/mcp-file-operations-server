# File Operations MCP Server

[![smithery badge](https://smithery.ai/badge/@bsmi021/mcp-file-operations-server)](https://smithery.ai/server/@bsmi021/mcp-file-operations-server)

A Model Context Protocol (MCP) server that provides enhanced file operation capabilities with streaming, patching, and change tracking support.

<a href="https://glama.ai/mcp/servers/7b750si00d">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/7b750si00d/badge" alt="File Operations Server MCP server" />
</a>

## Features

- **Basic File Operations**: Copy, read, write, move, and delete files
- **Directory Operations**: Create, remove, and copy directories
- **File Watching**: Monitor files and directories for changes
- **Change Tracking**: Track and query file operation history
- **Streaming Support**: Handle large files efficiently with streaming
- **Resource Support**: Access files and directories through MCP resources
- **Progress Reporting**: Real-time progress updates for long operations
- **Rate Limiting**: Protection against excessive requests
- **Enhanced Security**: Path validation and input sanitization
- **Robust Error Handling**: Comprehensive error handling and reporting
- **Type Safety**: Full TypeScript support with strict type checking

## Installation

### Installing via Smithery

To install File Operations Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@bsmi021/mcp-file-operations-server):

```bash
npx -y @smithery/cli install @bsmi021/mcp-file-operations-server --client claude
```

### Manual Installation
```bash
npm install
```

## Usage

### Starting the Server

```bash
npm start
```

For development with auto-reloading:

```bash
npm run dev
```

### Available Tools

#### Basic File Operations

- `copy_file`: Copy a file to a new location
- `read_file`: Read content from a file
- `write_file`: Write content to a file
- `move_file`: Move/rename a file
- `delete_file`: Delete a file
- `append_file`: Append content to a file

#### Directory Operations

- `make_directory`: Create a directory
- `remove_directory`: Remove a directory
- `copy_directory`: Copy a directory recursively (with progress reporting)

#### Watch Operations

- `watch_directory`: Start watching a directory for changes
- `unwatch_directory`: Stop watching a directory

#### Change Tracking

- `get_changes`: Get the list of recorded changes
- `clear_changes`: Clear all recorded changes

### Available Resources

#### Static Resources

- `file:///recent-changes`: List of recent file system changes

#### Resource Templates

- `file://{path}`: Access file contents
- `metadata://{path}`: Access file metadata
- `directory://{path}`: List directory contents

### Example Usage

```typescript
// Copy a file
await fileOperations.copyFile({
    source: 'source.txt',
    destination: 'destination.txt',
    overwrite: false
});

// Watch a directory
await fileOperations.watchDirectory({
    path: './watched-dir',
    recursive: true
});

// Access file contents through resource
const resource = await mcp.readResource('file:///path/to/file.txt');
console.log(resource.contents[0].text);

// Copy directory with progress tracking
const result = await fileOperations.copyDirectory({
    source: './source-dir',
    destination: './dest-dir',
    overwrite: false
});
// Progress token in result can be used to track progress
console.log(result.progressToken);
```

## Rate Limits

The server implements rate limiting to prevent abuse:

- **Tools**: 100 requests per minute
- **Resources**: 200 requests per minute
- **Watch Operations**: 20 operations per minute

Rate limit errors include a retry-after period in the error message.

## Security Features

### Path Validation

All file paths are validated to prevent directory traversal attacks:

- No parent directory references (`../`)
- Proper path normalization
- Input sanitization

### Resource Protection

- Rate limiting on all operations
- Proper error handling and logging
- Input validation on all parameters
- Safe resource cleanup

## Progress Reporting

Long-running operations like directory copying provide progress updates:

```typescript
interface ProgressUpdate {
    token: string | number;
    message: string;
    percentage: number;
}
```

Progress can be tracked through the progress token returned in the operation result.

## Development

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

### Testing

```bash
npm test
```

## Configuration

The server can be configured through various settings:

- **Rate Limiting**: Configure request limits and windows
- **Progress Reporting**: Control update frequency and detail level
- **Resource Access**: Configure resource permissions and limits
- **Security Settings**: Configure path validation rules
- **Change Tracking**: Set retention periods and storage options
- **Watch Settings**: Configure debounce times and recursive watching

## Error Handling

The server provides detailed error information through the `FileOperationError` class and MCP error codes:

### Standard MCP Error Codes

- `InvalidRequest`: Invalid parameters or request format
- `MethodNotFound`: Unknown tool or resource requested
- `InvalidParams`: Invalid parameters (e.g., path validation failure)
- `InternalError`: Server-side errors

### Custom Error Types

- File operation failures
- Rate limit exceeded
- Path validation errors
- Resource access errors

Each error includes:

- Specific error code
- Detailed error message
- Relevant metadata (file paths, limits, etc.)
- Stack traces in development mode

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.