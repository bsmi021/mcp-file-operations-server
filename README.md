# File Operations MCP Server

[![smithery badge](https://smithery.ai/badge/@bsmi021/mcp-file-operations-server)](https://smithery.ai/server/@bsmi021/mcp-file-operations-server)

A Model Context Protocol (MCP) server that provides enhanced file operation capabilities with streaming, patching, and change tracking support.

<a href="https://glama.ai/mcp/servers/7b750si00d">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/7b750si00d/badge" alt="File Operations Server MCP server" />
</a>

## Features

- **Basic File Operations**: Copy, read, write, move, and delete files
- **Batch File Operations**: Read and write multiple files in single operations for improved efficiency
- **Directory Operations**: Create, remove, and copy directories
- **File Watching**: Monitor files and directories for changes
- **Change Tracking**: Track and query file operation history
- **Streaming Support**: Handle large files efficiently with streaming
- **HTTP Interface**: Streamable HTTP interface with Server-Sent Events (SSE)
- **Resource Support**: Access files and directories through MCP resources
- **Progress Reporting**: Real-time progress updates for long operations
- **Rate Limiting**: Protection against excessive requests
- **Enhanced Security**: Path validation and input sanitization
- **Robust Error Handling**: Comprehensive error handling and reporting
- **Type Safety**: Full TypeScript support with strict type checking
- **Docker Support**: Containerized deployment with volume mounting

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

### Docker Installation

See [DOCKER.md](./DOCKER.md) for comprehensive Docker setup instructions including local drive mounting for Windows and Linux.

**Quick Docker Start:**
```bash
# Stdio transport (for MCP clients)
docker run -it --rm -v "$(pwd):/workspace" ghcr.io/bsmi021/mcp-file-operations-server

# HTTP transport (for web/remote access)
docker run -it --rm -p 3001:3001 -v "$(pwd):/workspace" -e MCP_TRANSPORT=http ghcr.io/bsmi021/mcp-file-operations-server
```

## Usage

### Transport Modes

The server supports two transport modes:

#### 1. Stdio Transport (Default)
For direct integration with MCP clients like Claude Desktop:

```bash
npm start
```

#### 2. HTTP Transport with SSE (New in v1.5)
For remote connections and web applications:

```bash
npm run start:http
```

The HTTP server provides:
- **SSE Endpoint**: `GET http://localhost:3001/sse` - Establishes streaming connection
- **Messages Endpoint**: `POST http://localhost:3001/messages` - Receives client messages  
- **Health Check**: `GET http://localhost:3001/health` - Server status
- **Sessions**: `GET http://localhost:3001/sessions` - Active connection info

### Starting the Server

#### Development Mode

```bash
# Stdio transport with auto-reload
npm run dev

# HTTP transport with auto-reload
npm run dev:http
```

#### Production Mode

```bash
# Stdio transport
npm start

# HTTP transport
npm run start:http

# Custom port for HTTP
npm run start:http -- --port 8080
```

### Available Tools

#### Basic File Operations

- `copy_file`: Copy a file to a new location
- `read_file`: Read content from a file
- `read_many_files`: Read content from multiple files in a single request
- `write_file`: Write content to a file
- `write_many_files`: Write content to multiple files in a single request
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

#### Using Stdio Transport (MCP Clients)

```typescript
// Copy a file
await fileOperations.copyFile({
    source: 'source.txt',
    destination: 'destination.txt',
    overwrite: false
});

// Read multiple files at once (batch operation)
await fileOperations.readManyFiles({
    paths: ['file1.txt', 'file2.txt', 'file3.txt']
});

// Write multiple files at once (batch operation)
await fileOperations.writeManyFiles({
    files: [
        { path: 'output1.txt', content: 'Content for file 1' },
        { path: 'output2.txt', content: 'Content for file 2' }
    ]
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

#### Using HTTP Transport (Web/Remote)

**Connecting via JavaScript:**

```javascript
// Establish SSE connection
const eventSource = new EventSource('http://localhost:3001/sse');
let sessionId = null;

eventSource.onopen = function() {
    console.log('Connected to MCP server');
};

eventSource.onmessage = function(event) {
    const message = JSON.parse(event.data);
    
    // Extract session ID from first message
    if (!sessionId && message.sessionId) {
        sessionId = message.sessionId;
    }
    
    console.log('Received:', message);
};

// Send a message to the server
async function sendMessage(method, params) {
    const message = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,
        params: params
    };
    
    const response = await fetch('http://localhost:3001/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId
        },
        body: JSON.stringify(message)
    });
    
    return response.json();
}

// Example: List tools
sendMessage('tools/list', {});

// Example: Read a file
sendMessage('tools/call', {
    name: 'read_file',
    arguments: { path: '/workspace/example.txt' }
});

// Example: Read multiple files
sendMessage('tools/call', {
    name: 'read_many_files',
    arguments: { 
        paths: ['/workspace/file1.txt', '/workspace/file2.txt'] 
    }
});

// Example: Write multiple files  
sendMessage('tools/call', {
    name: 'write_many_files',
    arguments: { 
        files: [
            { path: '/workspace/output1.txt', content: 'Content 1' },
            { path: '/workspace/output2.txt', content: 'Content 2' }
        ]
    }
});
```

**Using curl for testing:**

```bash
# Start SSE connection in background
curl -N http://localhost:3001/sse &

# Check server health
curl http://localhost:3001/health

# List active sessions
curl http://localhost:3001/sessions
```

**Interactive Web Client:**

A complete interactive example is available at [`examples/http-client.html`](./examples/http-client.html). Open this file in a web browser to test the HTTP interface with a user-friendly GUI.

## What's New in v1.5

### MCP SDK v1.5 Upgrade
- **Streamable HTTP Interface**: New HTTP transport with Server-Sent Events (SSE)
- **Enhanced API**: Upgraded to MCP SDK v1.5 with improved zod-based schemas
- **Multiple Connections**: Support for simultaneous HTTP connections with session management
- **Better Type Safety**: Improved TypeScript integration and error handling

### Streaming Features
- **Large File Support**: Efficient streaming for large file operations
- **Real-time Progress**: Progress updates via SSE for long-running operations
- **Session Management**: Multiple client connections with isolated sessions
- **HTTP API**: RESTful endpoints alongside traditional MCP protocol

## Docker Support

### Quick Start with Docker

```bash
# Build the image
docker build -t mcp-file-operations-server .

# Run with stdio (for MCP clients)
docker run -it --rm -v "$(pwd):/workspace" mcp-file-operations-server

# Run with HTTP interface
docker run -it --rm -p 3001:3001 -v "$(pwd):/workspace" -e MCP_TRANSPORT=http mcp-file-operations-server
```

### Volume Mounting

**Windows:**
```cmd
docker run -it --rm -v "C:\MyProject:/workspace" -p 3001:3001 -e MCP_TRANSPORT=http mcp-file-operations-server
```

**Linux/macOS:**
```bash
docker run -it --rm -v "/home/user/project:/workspace" -p 3001:3001 -e MCP_TRANSPORT=http mcp-file-operations-server
```

For comprehensive Docker setup instructions including local drive mounting for Windows and Linux, see [DOCKER.md](./DOCKER.md).

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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_HTTP_PORT` | `3001` | Port for HTTP transport |

### Transport Selection

- **Stdio**: Best for MCP clients like Claude Desktop, direct integration
- **HTTP**: Best for web applications, remote access, development/testing

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