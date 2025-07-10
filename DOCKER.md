# Docker Setup and Local Drive Mounting Guide

This guide provides comprehensive instructions for running the MCP File Operations Server in Docker containers with local drive mounting support for both Windows and Linux systems.

## Table of Contents

- [Quick Start](#quick-start)
- [Transport Modes](#transport-modes)
- [Local Drive Mounting](#local-drive-mounting)
  - [Windows](#windows)
  - [Linux/macOS](#linuxmacos)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Build the Docker Image

```bash
# Clone the repository
git clone https://github.com/bsmi021/mcp-file-operations-server.git
cd mcp-file-operations-server

# Build the Docker image
docker build -t mcp-file-operations-server .
```

### Run with Default Settings (Stdio Transport)

```bash
docker run -it --rm \
  -v "$(pwd):/workspace" \
  mcp-file-operations-server
```

### Run with HTTP Transport

```bash
docker run -it --rm \
  -p 3001:3001 \
  -v "$(pwd):/workspace" \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

## Transport Modes

The MCP File Operations Server supports two transport modes:

### 1. Stdio Transport (Default)
- **Use case**: Direct integration with MCP clients like Claude Desktop
- **Communication**: Standard input/output streams
- **Configuration**: No additional setup required
- **Docker command**: Default behavior

### 2. HTTP Transport with Server-Sent Events (SSE)
- **Use case**: Remote connections, web applications, development/testing
- **Communication**: HTTP with SSE for streaming
- **Configuration**: Requires port exposure (-p 3001:3001)
- **Docker command**: Set `MCP_TRANSPORT=http`

## Local Drive Mounting

### Windows

#### Basic Drive Mounting

**Mount C: drive:**
```cmd
docker run -it --rm ^
  -v "C:\:/host-c" ^
  -p 3001:3001 ^
  -e MCP_TRANSPORT=http ^
  mcp-file-operations-server
```

**Mount specific user directory:**
```cmd
docker run -it --rm ^
  -v "C:\Users\%USERNAME%\Documents:/workspace" ^
  -p 3001:3001 ^
  -e MCP_TRANSPORT=http ^
  mcp-file-operations-server
```

**Mount multiple drives:**
```cmd
docker run -it --rm ^
  -v "C:\:/host-c" ^
  -v "D:\:/host-d" ^
  -v "E:\:/host-e" ^
  -p 3001:3001 ^
  -e MCP_TRANSPORT=http ^
  mcp-file-operations-server
```

#### PowerShell Examples

**Mount current directory:**
```powershell
docker run -it --rm `
  -v "${PWD}:/workspace" `
  -p 3001:3001 `
  -e MCP_TRANSPORT=http `
  mcp-file-operations-server
```

**Mount with specific permissions:**
```powershell
docker run -it --rm `
  -v "C:\MyProject:/workspace:rw" `
  -v "C:\ReadOnlyData:/readonly:ro" `
  -p 3001:3001 `
  -e MCP_TRANSPORT=http `
  mcp-file-operations-server
```

#### Windows Subsystem for Linux (WSL)

**Access WSL filesystem from Windows Docker:**
```cmd
docker run -it --rm ^
  -v "\\wsl$\Ubuntu\home\username\project:/workspace" ^
  -p 3001:3001 ^
  -e MCP_TRANSPORT=http ^
  mcp-file-operations-server
```

### Linux/macOS

#### Basic Drive Mounting

**Mount home directory:**
```bash
docker run -it --rm \
  -v "$HOME:/home-user" \
  -p 3001:3001 \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

**Mount current working directory:**
```bash
docker run -it --rm \
  -v "$(pwd):/workspace" \
  -p 3001:3001 \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

**Mount multiple directories:**
```bash
docker run -it --rm \
  -v "/home:/host-home" \
  -v "/opt:/host-opt" \
  -v "/var/log:/host-logs:ro" \
  -p 3001:3001 \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

#### Permission Management

**Run with current user permissions:**
```bash
docker run -it --rm \
  --user "$(id -u):$(id -g)" \
  -v "$HOME:/home-user" \
  -v "/etc/passwd:/etc/passwd:ro" \
  -v "/etc/group:/etc/group:ro" \
  -p 3001:3001 \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

**Mount with specific ownership:**
```bash
# First, create a directory with proper permissions
mkdir -p ./shared-data
sudo chown 1000:1000 ./shared-data

docker run -it --rm \
  -v "$(pwd)/shared-data:/workspace" \
  -p 3001:3001 \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_HTTP_PORT` | `3001` | Port for HTTP transport |

### Volume Mount Options

| Option | Description | Example |
|--------|-------------|---------|
| `rw` | Read-write access (default) | `-v "/path:/container:rw"` |
| `ro` | Read-only access | `-v "/path:/container:ro"` |
| `z` | SELinux private label | `-v "/path:/container:z"` |
| `Z` | SELinux shared label | `-v "/path:/container:Z"` |

## Examples

### Development Environment

**Full development setup with code and data access:**

```bash
# Linux/macOS
docker run -it --rm \
  --name mcp-file-ops-dev \
  -v "$(pwd):/workspace" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.gitconfig:/root/.gitconfig:ro" \
  -p 3001:3001 \
  -e MCP_TRANSPORT=http \
  mcp-file-operations-server
```

```cmd
REM Windows
docker run -it --rm ^
  --name mcp-file-ops-dev ^
  -v "%CD%:/workspace" ^
  -v "%USERPROFILE%\.ssh:/root/.ssh:ro" ^
  -v "%USERPROFILE%\.gitconfig:/root/.gitconfig:ro" ^
  -p 3001:3001 ^
  -e MCP_TRANSPORT=http ^
  mcp-file-operations-server
```

### Production Deployment

**Secure production setup with limited access:**

```bash
docker run -d \
  --name mcp-file-ops-prod \
  --restart unless-stopped \
  -v "/opt/app-data:/workspace:rw" \
  -v "/opt/app-config:/config:ro" \
  -v "/var/log/mcp:/logs" \
  -p 127.0.0.1:3001:3001 \
  -e MCP_TRANSPORT=http \
  -e MCP_HTTP_PORT=3001 \
  --user 1000:1000 \
  mcp-file-operations-server
```

### Docker Compose

**Create a `docker-compose.yml` file:**

```yaml
version: '3.8'

services:
  mcp-file-operations:
    build: .
    container_name: mcp-file-operations-server
    environment:
      - MCP_TRANSPORT=http
      - MCP_HTTP_PORT=3001
    ports:
      - "3001:3001"
    volumes:
      - "./data:/workspace"
      - "./config:/config:ro"
      - "./logs:/logs"
    restart: unless-stopped
    user: "1000:1000"  # Adjust to your user ID
    
  # Optional: Add a reverse proxy
  nginx:
    image: nginx:alpine
    container_name: mcp-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "./nginx.conf:/etc/nginx/nginx.conf:ro"
      - "./ssl:/etc/ssl:ro"
    depends_on:
      - mcp-file-operations
    restart: unless-stopped
```

**Run with Docker Compose:**

```bash
docker-compose up -d
```

## Troubleshooting

### Common Issues

#### Permission Denied Errors

**Problem**: Cannot read/write files in mounted volumes

**Solution for Linux/macOS:**
```bash
# Check file permissions
ls -la /path/to/mounted/directory

# Fix ownership
sudo chown -R $(id -u):$(id -g) /path/to/mounted/directory

# Run with user mapping
docker run --user "$(id -u):$(id -g)" ...
```

**Solution for Windows:**
```cmd
# Ensure Docker Desktop has access to the drive
# Go to Docker Desktop > Settings > Resources > File Sharing
# Add the drive/folder you want to mount
```

#### Port Already in Use

**Problem**: Port 3001 is already in use

**Solution:**
```bash
# Use a different port
docker run -p 3002:3001 -e MCP_HTTP_PORT=3001 ...

# Or find and stop the conflicting process
lsof -i :3001  # Linux/macOS
netstat -ano | findstr :3001  # Windows
```

#### Container Cannot Access Network

**Problem**: HTTP transport not working

**Solution:**
```bash
# Check container networking
docker network ls
docker inspect <container-name>

# Test connectivity
curl http://localhost:3001/health
```

#### SELinux Issues (Linux)

**Problem**: Permission denied despite correct ownership

**Solution:**
```bash
# Add SELinux labels
docker run -v "/path:/container:Z" ...

# Or temporarily disable SELinux
sudo setenforce 0
```

### Testing Your Setup

#### Test Stdio Transport

```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | docker run -i --rm -v "$(pwd):/workspace" mcp-file-operations-server
```

#### Test HTTP Transport

```bash
# Start the container
docker run -d --name test-mcp -p 3001:3001 -v "$(pwd):/workspace" -e MCP_TRANSPORT=http mcp-file-operations-server

# Test health endpoint
curl http://localhost:3001/health

# Test SSE endpoint (should receive SSE headers)
curl -v http://localhost:3001/sse

# Cleanup
docker stop test-mcp && docker rm test-mcp
```

### Performance Considerations

- **Volume mounting**: Use bind mounts for better performance than named volumes for development
- **Network**: Use host networking (`--network host`) for better performance in Linux
- **Resources**: Allocate sufficient memory for large file operations
- **Storage**: Use SSD storage for mounted volumes when possible

### Security Best Practices

1. **Principle of least privilege**: Only mount directories that are needed
2. **Read-only mounts**: Use `:ro` for configuration and reference data
3. **User mapping**: Run containers with non-root users when possible
4. **Network isolation**: Bind HTTP transport to localhost in production
5. **Regular updates**: Keep the Docker image updated with latest security patches