// Desktop shell: runs the Next.js standalone server privately and shows it in a window.
const { app, BrowserWindow, shell, dialog } = require("electron");
const { fork } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const SERVER_DIR = app.isPackaged
	? path.join(process.resourcesPath, "server")
	: path.join(__dirname, "build", "server");

let serverProcess = null;
let serverUrl = null;

function getFreePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
	});
}

// The web app validates these at startup. The editor itself runs fully in the
// browser (IndexedDB), so account/blog/sound-search services are left unconfigured.
function serverEnv(port) {
	const url = `http://127.0.0.1:${port}`;
	return {
		...process.env,
		NODE_ENV: "production",
		PORT: String(port),
		HOSTNAME: "127.0.0.1",
		NEXT_PUBLIC_SITE_URL: url,
		NEXT_PUBLIC_MARBLE_API_URL: "https://api.marblecms.com",
		DATABASE_URL: "postgresql://opencut:opencut@127.0.0.1:5432/opencut",
		BETTER_AUTH_SECRET: crypto.randomBytes(32).toString("base64"),
		UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079",
		UPSTASH_REDIS_REST_TOKEN: "local",
		MARBLE_WORKSPACE_KEY: "none",
		FREESOUND_CLIENT_ID: "none",
		FREESOUND_API_KEY: "none",
	};
}

function waitForServer(url, timeoutMs = 30000) {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const attempt = () => {
			http
				.get(`${url}/api/health`, (res) => {
					res.resume();
					resolve();
				})
				.on("error", () => {
					if (Date.now() > deadline) {
						reject(new Error("OpenCut server did not start in time"));
					} else {
						setTimeout(attempt, 200);
					}
				});
		};
		attempt();
	});
}

async function startServer() {
	const entry = path.join(SERVER_DIR, "apps", "web", "server.js");
	if (!fs.existsSync(entry)) {
		throw new Error(`Server bundle not found at ${entry}. Run "bun run prepare-server".`);
	}
	const port = await getFreePort();
	serverUrl = `http://127.0.0.1:${port}`;
	// Not utilityProcess: it lacks WebAssembly.instantiateStreaming, which the editor's SSR needs
	serverProcess = fork(entry, [], {
		cwd: path.dirname(entry),
		env: { ...serverEnv(port), ELECTRON_RUN_AS_NODE: "1" },
		stdio: ["ignore", "pipe", "pipe", "ipc"],
	});
	serverProcess.stdout?.on("data", (d) => process.stdout.write(d));
	serverProcess.stderr?.on("data", (d) => process.stderr.write(d));
	serverProcess.on("exit", (code) => {
		serverProcess = null;
		if (code !== 0 && !app.isQuitting) {
			dialog.showErrorBox("OpenCut", `The editor server stopped (exit code ${code}).`);
			app.quit();
		}
	});
	await waitForServer(serverUrl);
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 600,
		title: "OpenCut",
		backgroundColor: "#0a0a0a",
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	// Keep the app on its own server; open everything else in the default browser.
	const isInternal = (url) => url.startsWith(serverUrl);
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (isInternal(url)) return { action: "allow" };
		shell.openExternal(url);
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		if (!isInternal(url)) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	win.once("ready-to-show", () => win.show());
	win.loadURL(`${serverUrl}/projects`);
}

app.on("before-quit", () => {
	app.isQuitting = true;
	serverProcess?.kill();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0 && serverUrl) createWindow();
});

app.whenReady().then(async () => {
	try {
		await startServer();
		createWindow();
	} catch (error) {
		dialog.showErrorBox("OpenCut failed to start", String(error?.stack || error));
		app.quit();
	}
});
