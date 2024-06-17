import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { red, yellow, green, blue } from 'colorette';
import app from './app';  // Import the Express app

// Load environment variables from .env file
dotenv.config();

type ErrnoException = NodeJS.ErrnoException;

class ServerManager {
    private sslKey: string;
    private sslCert: string;
    private httpsPortRange: [number, number];
    private httpPortRange: [number, number];
    private httpPort: number;
    private httpRedirectServerStarted: boolean = false;
    private serverName: string;
    private httpServer?: http.Server;
    private httpsServer?: https.Server;

    constructor() {
        this.sslKey = this.ensureFile(this.getEnvVar("SSLKEY"));
        this.sslCert = this.ensureFile(this.getEnvVar("SSLCERT"));
        this.httpsPortRange = this.parsePortRange("HTTPS_PORT_RANGE");
        this.httpPortRange = this.parsePortRange("FALLBACK_HTTP_PORT_RANGE");
        this.httpPort = this.toInt(this.getEnvVar('HTTP_PORT'));
        this.serverName = this.getEnvVar('HTTPS_SERVERNAME');

        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    private getEnvVar(name: string): string {
        const value = process.env[name];
        if (typeof value === "undefined") {
            throw new Error(`Environment variable ${name} is not set`);
        }
        return value;
    }

    private ensureFile(filePath: string): string {
        try {
            fs.accessSync(filePath, fs.constants.R_OK);
            return filePath;
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(`Error accessing file at ${filePath}: ${error.message}`);
            } else {
                console.error(`An unexpected error occurred while accessing file at ${filePath}`);
            }
            throw new Error(`File at ${filePath} is not accessible`);
        }
    }

    private parsePortRange(envVar: string): [number, number] {
        const range = this.getEnvVar(envVar).split(',');
        if (range.length !== 2) {
            throw new Error(`Invalid port range format for ${envVar}`);
        }
        return [parseInt(range[0], 10), parseInt(range[1], 10)];
    }

    private toInt(value: string): number {
        const num: number = parseInt(value, 10);
        if (isNaN(num)) {
            throw new Error(`Invalid number format: ${value}`);
        }
        return num;
    }

    private handleError(error: unknown): void {
        if (error instanceof Error) {
            console.error(red(`Error: ${error.message}`));
        } else {
            console.error(red(`Unexpected error: ${error}`));
        }
        process.exit(1);
    }

    public checkHttpPort(): void {
        const req = http.request({ hostname: 'localhost', port: this.httpPort, path: '/', method: 'HEAD' }, res => {
            const serverName = res.headers['server'];
            console.log(
                red(`Running`),
                blue(`${serverName}`),
                red(`HTTP server is detected on port`),
                yellow(this.httpPort.toString()),
                red(`with status code:`),
                yellow(`${res.statusCode}`)
            );
            res.resume();
            this.startHttpsServer(this.httpsPortRange[0], this.httpsPortRange[1]);
        });

        req.on('error', (error: unknown) => {
            const e = error as ErrnoException;
            if (e.code === 'ECONNREFUSED' || e.code === 'EHOSTUNREACH') {
                console.log(`No HTTP server is running on port ${this.httpPort}.`);
                this.startHttpsServer(this.httpsPortRange[0], this.httpsPortRange[1]);
                if (!this.httpRedirectServerStarted) {
                    this.startHttpRedirectServer(this.httpPort, this.httpPortRange[0], this.httpsPortRange[0], true);
                    this.httpRedirectServerStarted = true;
                }
            } else {
                this.handleError(`Error connecting to port ${this.httpPort}: ${e.message}`);
            }
        });

        req.end();
    }

    private startHttpsServer(startPort: number, endPort: number): void {
        const options: https.ServerOptions = { key: fs.readFileSync(this.sslKey), cert: fs.readFileSync(this.sslCert) };

        const tryPort = (port: number) => {
            if (port > endPort) {
                console.error(`All ports in the specified range (${startPort}-${endPort}) are in use.`);
                return;
            }

            const server = https.createServer(options, app);  // Use the Express app

            server.listen(port, () => {
                console.log(green(`Node.js HTTPS server`), blue(this.serverName), green(`running on port`), yellow(port.toString()));
                this.httpsServer = server;
                if (!this.httpRedirectServerStarted) {
                    this.startHttpRedirectServer(this.httpPortRange[0], this.httpPortRange[1], port, false);
                    this.httpRedirectServerStarted = true;
                }
            }).on('error', (err: ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`Port ${port} is in use, trying next port...`);
                    tryPort(port + 1);
                } else {
                    this.handleError(`Error starting HTTPS server on port ${port}: ${err.message}`);
                }
            });
        };

        tryPort(startPort);
    }

    private startHttpRedirectServer(startPort: number, endPort: number, httpsPort: number, useExactPort: boolean): void {
        const httpServer = http.createServer((req, res) => {
            const host = req.headers.host?.replace(/:\d+$/, '');
            res.writeHead(301, { Location: `https://${host}:${httpsPort}${req.url}`, 'Server': this.serverName });
            res.end();
        });

        const tryPort = (port: number) => {
            if (!useExactPort && port > endPort) {
                console.error(red("No available ports to use for HTTP redirection within the specified range."));
                return;
            }

            console.log(`Attempting to listen HTTP redirection server on port`, yellow(port.toString()), `...`);
            httpServer.listen(port, () => {
                console.log(
                    green(`HTTP redirection server successfully running on port`),
                    yellow(`${port}`),
                    green(`and redirecting to HTTPS server on port`),
                    yellow(httpsPort.toString())
                );
                this.httpServer = httpServer;
            }).on('error', (err: ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    if (useExactPort) {
                        console.error(`Port ${port} is already in use.`);
                    } else {
                        console.error(`Port ${port} is already in use. Trying next port...`);
                        tryPort(port + 1);
                    }
                } else {
                    this.handleError(`Failed to start HTTP server on port ${port} due to error: ${err.message}`);
                }
            });
        };

        tryPort(startPort);
    }

    private shutdown(): void {
        console.log(blue('Shutting down servers...'));

        const closeHttpServer = new Promise<void>((resolve, reject) => {
            if (this.httpServer) {
                this.httpServer.close(err => {
                    if (err) {
                        console.error(red(`Error shutting down HTTP server: ${err.message}`));
                        reject(err);
                    } else {
                        console.log(green('HTTP server shut down successfully.'));
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });

        const closeHttpsServer = new Promise<void>((resolve, reject) => {
            if (this.httpsServer) {
                this.httpsServer.close(err => {
                    if (err) {
                        console.error(red(`Error shutting down HTTPS server: ${err.message}`));
                        reject(err);
                    } else {
                        console.log(green('HTTPS server shut down successfully.'));
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });

        Promise.all([closeHttpServer, closeHttpsServer])
            .then(() => {
                console.log(green('All servers shut down gracefully.'));
                process.exit(0);
            })
            .catch(err => {
                console.error(red(`Error during shutdown: ${err.message}`));
                process.exit(1);
            });
    }
}

// Instantiate the ServerManager and check for HTTP server on the configured port
const serverManager = new ServerManager();
serverManager.checkHttpPort();
