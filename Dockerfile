# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
FROM node:lts-alpine

# Create app directory
WORKDIR /app

# Copy package files and tsconfig
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies without running scripts
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Expose HTTP port for streaming interface (3001 by default)
EXPOSE 3001

# Add environment variables for configuration
ENV MCP_TRANSPORT=stdio
ENV MCP_HTTP_PORT=3001

# Create a startup script that handles both transports
RUN echo '#!/bin/sh\nif [ "$MCP_TRANSPORT" = "http" ]; then\n  exec npm run start:http\nelse\n  exec npm start\nfi' > /app/start.sh && \
    chmod +x /app/start.sh

# Use the startup script as the default command
CMD [ "/app/start.sh" ]
