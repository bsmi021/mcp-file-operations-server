#!/usr/bin/env node

import { FileOperationsServer } from './server.js';
import { FileOperationsHttpServer } from './httpServer.js';

/**
 * Main entry point for the File Operations MCP Server
 * Handles server initialization, error handling, and graceful shutdown
 * Supports both stdio and HTTP transports based on command line arguments
 */
async function main() {
    let server: FileOperationsServer | FileOperationsHttpServer | null = null;

    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const useHttp = args.includes('--http') || args.includes('-h');
        const port = getPortFromArgs(args) || 3001;

        // Set up error handlers
        process.on('uncaughtException', (error) => {
            console.error('[Uncaught Exception]', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            console.error('[Unhandled Rejection]', reason);
            process.exit(1);
        });

        // Handle termination signals
        const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        signals.forEach((signal) => {
            process.once(signal, async () => {
                console.error(`\nReceived ${signal}, shutting down...`);
                if (server) {
                    try {
                        if (server instanceof FileOperationsHttpServer) {
                            await server.stop();
                        } else {
                            await server.cleanup();
                        }
                    } catch (error) {
                        console.error('Error during cleanup:', error);
                    }
                }
                process.exit(0);
            });
        });

        // Initialize and run server based on transport type
        if (useHttp) {
            server = new FileOperationsHttpServer();
            await server.start(port);
        } else {
            server = new FileOperationsServer();
            await server.run();
        }

    } catch (error) {
        console.error('[Fatal Error]', error);
        process.exit(1);
    }
}

/**
 * Extract port number from command line arguments
 */
function getPortFromArgs(args: string[]): number | null {
    const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
    if (portIndex !== -1 && portIndex + 1 < args.length) {
        const port = parseInt(args[portIndex + 1], 10);
        if (!isNaN(port) && port > 0 && port <= 65535) {
            return port;
        }
    }
    return null;
}

// Start the server
main().catch((error) => {
    console.error('[Startup Error]', error);
    process.exit(1);
});
