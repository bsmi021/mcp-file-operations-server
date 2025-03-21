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

# Expose any required port if needed (not explicitly required by MCP)

# Start the server
CMD [ "npm", "start" ]
