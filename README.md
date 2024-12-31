# File Operations MCP Server

A Model Context Protocol (MCP) server that provides enhanced file operation capabilities with streaming, patching, and change tracking support.

## Features

- **Basic File Operations**: Copy, read, write, move, and delete files
- **Directory Operations**: Create, remove, and copy directories
- **File Watching**: Monitor files and directories for changes
- **Patch Operations**: Apply patches to files with various strategies
- **Change Tracking**: Track and query file operation history
- **Streaming Support**: Handle large files efficiently with streaming
- **Robust Error Handling**: Comprehensive error handling and reporting
- **Type Safety**: Full TypeScript support with strict type checking

## Installation

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
- `copy_directory`: Copy a directory recursively

#### Watch Operations

- `watch_directory`: Start watching a directory for changes
- `unwatch_directory`: Stop watching a directory

#### Patch Operations

- `apply_patch`: Apply a patch to a file with various strategies:
  - Line-based patching
  - Block-based patching
  - Diff-based patching
  - Complete file replacement

#### Change Tracking

- `get_changes`: Get the list of recorded changes
- `clear_changes`: Clear all recorded changes

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

// Apply a patch
await fileOperations.applyPatch({
    operation: {
        type: 'line',
        filePath: 'file.txt',
        search: 'old line',
        replace: 'new line',
        createBackup: true,
        whitespaceConfig: {
            ignoreIndentation: true,
            ignoreLineEndings: true
        }
    }
});
```

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

- **Batch Processing**: Control chunk sizes and parallel processing
- **Whitespace Handling**: Configure indentation and line ending handling
- **Change Tracking**: Set retention periods and storage options
- **Watch Settings**: Configure debounce times and recursive watching

## Error Handling

The server provides detailed error information through the `FileOperationError` class, including:

- Error codes for specific failure types
- Detailed error messages
- File paths involved in the error
- Stack traces for debugging

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
