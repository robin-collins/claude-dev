import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"
import { ClaudeDev } from "../ClaudeDev"
import { ApiModelId, ApiProvider } from "../shared/api"
import { ExtensionMessage } from "../shared/ExtensionMessage"
import { WebviewMessage } from "../shared/WebviewMessage"
import { downloadTask, getNonce, getUri, selectImages } from "../utils"
import * as path from "path"
import fs from "fs/promises"
import { HistoryItem } from "../shared/HistoryItem"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

type SecretKey = "apiKey" | "openRouterApiKey" | "awsAccessKey" | "awsSecretKey"
type GlobalStateKey =
	| "apiProvider"
	| "apiModelId"
	| "awsRegion"
	| "maxRequestsPerTask"
	| "lastShownAnnouncementId"
	| "customInstructions"
	| "approveReadFile"
	| "approveListFilesTopLevel"
	| "approveListFilesRecursively"
	| "taskHistory"
	| "excludedFiles"
	| "whitelistedFiles"

export class ClaudeDevProvider implements vscode.WebviewViewProvider {
	public static readonly sideBarId = "claude-dev.SidebarProvider" // used in package.json as the view's id. This value cannot be changed due to how vscode caches views based on their id, and updating the id would break existing instances of the extension.
	public static readonly tabPanelId = "claude-dev.TabPanelProvider"
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private claudeDev?: ClaudeDev
	private latestAnnouncementId = "aug-17-2024" // update to some unique identifier when we add a new announcement
	private excludedFiles: Set<string> = new Set()
	private whitelistedFiles: Set<string> = new Set()
	private approveReadFile: boolean = true
	private approveListFilesTopLevel: boolean = true
	private approveListFilesRecursively: boolean = true

	constructor(readonly context: vscode.ExtensionContext, private readonly outputChannel: vscode.OutputChannel) {
		this.outputChannel.appendLine("ClaudeDevProvider instantiated")
		this.loadExcludedAndWhitelistedFiles()
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		this.outputChannel.appendLine("Disposing ClaudeDevProvider...")
		await this.clearTask()
		this.outputChannel.appendLine("Cleared task")
		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.outputChannel.appendLine("Disposed webview")
		}
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.outputChannel.appendLine("Disposed all disposables")
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView | vscode.WebviewPanel
		//context: vscode.WebviewViewResolveContext<unknown>, used to recreate a deallocated webview, but we don't need this since we use retainContextWhenHidden
		//token: vscode.CancellationToken
	): void | Thenable<void> {
		this.outputChannel.appendLine("Resolving webview view")
		this.view = webviewView

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}
		webviewView.webview.html = this.getHtmlContent(webviewView.webview)
		this.outputChannel.appendLine("Set webview HTML content")

		// Sets up an event listener to listen for messages passed from the webview view context
		// and executes code based on the message that is recieved
		this.setWebviewMessageListener(webviewView.webview)
		this.outputChannel.appendLine("Set up webview message listener")

		// Logs show up in bottom panel > Debug Console
		//console.log("registering listener")

		// Listen for when the panel becomes visible
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView and WebviewPanel have all the same properties except for this visibility listener
			// panel
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						this.outputChannel.appendLine("Webview became visible (panel)")
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			// sidebar
			webviewView.onDidChangeVisibility(
				() => {
					if (this.view?.visible) {
						this.outputChannel.appendLine("Webview became visible (sidebar)")
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables
			)
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				this.outputChannel.appendLine("Webview disposed")
				await this.dispose()
			},
			null,
			this.disposables
		)

		// Listen for when color changes
		vscode.workspace.onDidChangeConfiguration(
			(e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					this.outputChannel.appendLine("Color theme changed")
					// Sends latest theme name to webview
					this.postStateToWebview()
				}
			},
			null,
			this.disposables
		)

		// if the extension is starting a new session, clear previous task state
		this.clearTask()

		// Clear previous version's (0.0.6) claudeMessage cache from workspace state. We now store in global state with a unique identifier for each provider instance. We need to store globally rather than per workspace to eventually implement task history
		this.updateWorkspaceState("claudeMessages", undefined)

		this.outputChannel.appendLine("Webview view resolved")
	}

	async initClaudeDevWithTask(task?: string, images?: string[]) {
		await this.clearTask() // ensures that an exising task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one
		const { maxRequestsPerTask, apiConfiguration, customInstructions, approveReadFile, approveListFilesTopLevel, approveListFilesRecursively } = await this.getState()
		this.claudeDev = new ClaudeDev(
			this, 
			apiConfiguration, 
			maxRequestsPerTask, 
			customInstructions, 
			approveReadFile,
			approveListFilesTopLevel,
			approveListFilesRecursively,			
			task, 
			images
		)
		this.claudeDev.setExcludedFiles(Array.from(this.excludedFiles))
		this.claudeDev.setWhitelistedFiles(Array.from(this.whitelistedFiles))
		this.outputChannel.appendLine("Initialized ClaudeDev with task")
	}

	async initClaudeDevWithHistoryItem(historyItem: HistoryItem) {
		await this.clearTask()
		const { maxRequestsPerTask, apiConfiguration, customInstructions } = await this.getState()
		this.claudeDev = new ClaudeDev(
			this,
			apiConfiguration,
			maxRequestsPerTask,
			customInstructions,
			this.approveReadFile,
			this.approveListFilesTopLevel,
			this.approveListFilesRecursively,
			undefined,
			undefined,
			historyItem
		)
		this.excludedFiles = new Set(historyItem.excludedFiles || [])
		this.whitelistedFiles = new Set(historyItem.whitelistedFiles || [])
		this.claudeDev.setExcludedFiles(Array.from(this.excludedFiles))
		this.claudeDev.setWhitelistedFiles(Array.from(this.whitelistedFiles))
		this.outputChannel.appendLine("Initialized ClaudeDev with history item")
	}

	// Send any JSON serializable data to the react app
	async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
		this.outputChannel.appendLine(`Posted message to webview: ${JSON.stringify(message)}`)
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		// Get the local path to main script run in the webview,
		// then convert it to a uri we can use in the webview.

		// The CSS file from the React build output
		const stylesUri = getUri(webview, this.context.extensionUri, [
			"webview-ui",
			"build",
			"static",
			"css",
			"main.css",
		])
		// The JS file from the React build output
		const scriptUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "static", "js", "main.js"])

		// The codicon font from the React build output
		// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-codicons-sample/src/extension.ts
		// we installed this package in the extension so that we can access it how its intended from the extension (the font file is likely bundled in vscode), and we just import the css fileinto our react app we don't have access to it
		// don't forget to add font-src ${webview.cspSource};
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce()

		this.outputChannel.appendLine(`Generated URIs for webview: styles=${stylesUri}, script=${scriptUri}, codicons=${codiconsUri}`)

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		const htmlContent = /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
            <title>Claude Dev</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
        </html>
      `

		this.outputChannel.appendLine(`Generated HTML content: ${htmlContent}`)
		return htmlContent
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is recieved.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				this.outputChannel.appendLine(`Received message from webview: ${JSON.stringify(message)}`)
				switch (message.type) {
					case "webviewDidLaunch":
						await this.postStateToWebview()
						break
					case "newTask":
						await this.initClaudeDevWithTask(message.text, message.images)
						break
					case "apiConfiguration":
						if (message.apiConfiguration) {
							const {
								apiProvider,
								apiModelId,
								apiKey,
								openRouterApiKey,
								awsAccessKey,
								awsSecretKey,
								awsRegion,
							} = message.apiConfiguration
							await this.updateGlobalState("apiProvider", apiProvider)
							await this.updateGlobalState("apiModelId", apiModelId)
							await this.storeSecret("apiKey", apiKey)
							await this.storeSecret("openRouterApiKey", openRouterApiKey)
							await this.storeSecret("awsAccessKey", awsAccessKey)
							await this.storeSecret("awsSecretKey", awsSecretKey)
							await this.updateGlobalState("awsRegion", awsRegion)
							this.claudeDev?.updateApi(message.apiConfiguration)
						}
						await this.postStateToWebview()
						break
					case "maxRequestsPerTask":
						let result: number | undefined = undefined
						if (message.text && message.text.trim()) {
							const num = Number(message.text)
							if (!isNaN(num)) {
								result = num
							}
						}
						await this.updateGlobalState("maxRequestsPerTask", result)
						this.claudeDev?.updateMaxRequestsPerTask(result)
						await this.postStateToWebview()
						break
					case "customInstructions":
						await this.updateGlobalState("customInstructions", message.text || undefined)
						this.claudeDev?.updateCustomInstructions(message.text || undefined)
						await this.postStateToWebview()
						break
					case "approveReadFile":
						await this.updateGlobalState("approveReadFile", message.value)
						this.approveReadFile = message.value ?? false
						this.claudeDev?.updateApproveReadFile(message.value ?? false)
						await this.postStateToWebview()
						break
					case "approveListFilesTopLevel":
						await this.updateGlobalState("approveListFilesTopLevel", message.value)
						this.approveListFilesTopLevel = message.value ?? false
						this.claudeDev?.updateApproveListFilesTopLevel(message.value ?? false)
						await this.postStateToWebview()
						break
					case "approveListFilesRecursively":
						await this.updateGlobalState("approveListFilesRecursively", message.value)
						this.approveListFilesRecursively = message.value ?? false
						this.claudeDev?.updateApproveListFilesRecursively(message.value ?? false)
						await this.postStateToWebview()
						break
					case "askResponse":
						if (message.askResponse === "yesButtonTapped" && message.text === "fileReadApproved") {
							const filePath = message.images?.[0]
							if (filePath) {
								this.whitelistedFiles.add(filePath)
								await this.saveWhitelistedFiles()
								this.claudeDev?.setWhitelistedFiles(Array.from(this.whitelistedFiles))
							}
						} else if (message.askResponse === "noButtonTapped" && message.text === "fileReadDenied") {
							const filePath = message.images?.[0]
							if (filePath) {
								this.excludedFiles.add(filePath)
								await this.saveExcludedFiles()
								this.claudeDev?.setExcludedFiles(Array.from(this.excludedFiles))
							}
						}
						this.claudeDev?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
						break
					case "clearTask":
						await this.clearTask()
						await this.postStateToWebview()
						break
					case "didShowAnnouncement":
						await this.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
						await this.postStateToWebview()
						break
					case "selectImages":
						const images = await selectImages()
						await this.postMessageToWebview({ type: "selectedImages", images })
						break
					case "exportCurrentTask":
						const currentTaskId = this.claudeDev?.taskId
						if (currentTaskId) {
							this.exportTaskWithId(currentTaskId)
						}
						break
					case "showTaskWithId":
						this.showTaskWithId(message.text!)
						break
					case "deleteTaskWithId":
						this.deleteTaskWithId(message.text!)
						break
					case "exportTaskWithId":
						this.exportTaskWithId(message.text!)
						break
					case "updateExcludedFiles":
						if (Array.isArray(message.files)) {
							await this.updateExcludedFiles(message.files)
							await this.postStateToWebview()
						}
						break
					case "updateWhitelistedFiles":
						if (Array.isArray(message.files)) {
							await this.updateWhitelistedFiles(message.files)
							await this.postStateToWebview()
						}
						break
				}
			},
			null,
			this.disposables
		)
	}

	// Task history

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		claudeMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks", id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, "api_conversation_history.json")
			const claudeMessagesFilePath = path.join(taskDirPath, "claude_messages.json")
			const fileExists = await fs
				.access(apiConversationHistoryFilePath)
				.then(() => true)
				.catch(() => false)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					claudeMessagesFilePath,
					apiConversationHistory,
				}
			}
		}
		// if we tried to get a task that doesn't exist, remove it from state
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.claudeDev?.taskId) {
			// non-current task
			const { historyItem } = await this.getTaskWithId(id)
			await this.initClaudeDevWithHistoryItem(historyItem) // clears existing task
		}
		await this.postMessageToWebview({ type: "action", action: "chatButtonTapped" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	async deleteTaskWithId(id: string) {
		if (id === this.claudeDev?.taskId) {
			await this.clearTask()
		}

		const { taskDirPath, apiConversationHistoryFilePath, claudeMessagesFilePath } = await this.getTaskWithId(id)

		// Delete the task files
		const apiConversationHistoryFileExists = await fs
			.access(apiConversationHistoryFilePath)
			.then(() => true)
			.catch(() => false)
		if (apiConversationHistoryFileExists) {
			await fs.unlink(apiConversationHistoryFilePath)
		}
		const claudeMessagesFileExists = await fs
			.access(claudeMessagesFilePath)
			.then(() => true)
			.catch(() => false)
		if (claudeMessagesFileExists) {
			await fs.unlink(claudeMessagesFilePath)
		}
		await fs.rmdir(taskDirPath) // succeeds if the dir is empty

		await this.deleteTaskFromState(id)
	}

	async deleteTaskFromState(id: string) {
		// Remove the task from history
		const taskHistory = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)

		// Notify the webview that the task has been deleted
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const { 
			apiConfiguration, 
			maxRequestsPerTask, 
			lastShownAnnouncementId, 
			customInstructions,
			approveReadFile,
			approveListFilesTopLevel,
			approveListFilesRecursively,
			taskHistory
		} = await this.getState()
		this.postMessageToWebview({
			type: "state",
			state: {
				version: this.context.extension?.packageJSON?.version ?? "",
				apiConfiguration,
				maxRequestsPerTask,
				customInstructions,
				themeName: vscode.workspace.getConfiguration("workbench").get<string>("colorTheme"),
				claudeMessages: this.claudeDev?.claudeMessages || [],
				taskHistory: (taskHistory || []).filter((item) => item.ts && item.task).sort((a, b) => b.ts - a.ts),
				shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
				approveReadFile,
				approveListFilesTopLevel,
				approveListFilesRecursively,
				excludedFiles: Array.from(this.excludedFiles),
				whitelistedFiles: Array.from(this.whitelistedFiles)
			},
		})
	}

	async clearTask() {
		this.claudeDev?.abortTask()
		this.claudeDev = undefined // removes reference to it, so once promises end it will be garbage collected
		this.outputChannel.appendLine("Cleared task")
	}

	async getState() {
		const [
			storedApiProvider,
			apiModelId,
			apiKey,
			openRouterApiKey,
			awsAccessKey,
			awsSecretKey,
			awsRegion,
			maxRequestsPerTask,
			lastShownAnnouncementId,
			customInstructions,
			approveReadFile,
			approveListFilesTopLevel,
			approveListFilesRecursively,			
			taskHistory,
			excludedFiles,
			whitelistedFiles
		] = await Promise.all([
			this.getGlobalState("apiProvider") as Promise<ApiProvider | undefined>,
			this.getGlobalState("apiModelId") as Promise<ApiModelId | undefined>,
			this.getSecret("apiKey") as Promise<string | undefined>,
			this.getSecret("openRouterApiKey") as Promise<string | undefined>,
			this.getSecret("awsAccessKey") as Promise<string | undefined>,
			this.getSecret("awsSecretKey") as Promise<string | undefined>,
			this.getGlobalState("awsRegion") as Promise<string | undefined>,
			this.getGlobalState("maxRequestsPerTask") as Promise<number | undefined>,
			this.getGlobalState("lastShownAnnouncementId") as Promise<string | undefined>,
			this.getGlobalState("customInstructions") as Promise<string | undefined>,
			this.getGlobalState("approveReadFile") as Promise<boolean | undefined>,
			this.getGlobalState("approveListFilesTopLevel") as Promise<boolean | undefined>,
			this.getGlobalState("approveListFilesRecursively") as Promise<boolean | undefined>,			
			this.getGlobalState("taskHistory") as Promise<HistoryItem[] | undefined>,
			this.getGlobalState("excludedFiles") as Promise<string[] | undefined>,
			this.getGlobalState("whitelistedFiles") as Promise<string[] | undefined>
		])

		let apiProvider: ApiProvider
		if (storedApiProvider) {
			apiProvider = storedApiProvider
		} else {
			// Either new user or legacy user that doesn't have the apiProvider stored in state
			// (If they're using OpenRouter or Bedrock, then apiProvider state will exist)
			if (apiKey) {
				apiProvider = "anthropic"
			} else {
				// New users should default to anthropic (openrouter has issues, bedrock is complicated)
				apiProvider = "anthropic"
			}
		}

		return {
			apiConfiguration: {
				apiProvider,
				apiModelId,
				apiKey,
				openRouterApiKey,
				awsAccessKey,
				awsSecretKey,
				awsRegion,
			},
			maxRequestsPerTask,
			lastShownAnnouncementId,
			customInstructions,
			approveReadFile,
			approveListFilesTopLevel,
			approveListFilesRecursively,			
			taskHistory,
			excludedFiles: excludedFiles || [],
			whitelistedFiles: whitelistedFiles || []
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[]) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		
		// Include excluded and whitelisted files in the history item
		const updatedItem = {
			...item,
			excludedFiles: Array.from(this.excludedFiles),
			whitelistedFiles: Array.from(this.whitelistedFiles)
		}
		
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = updatedItem
		} else {
			history.push(updatedItem)
		}
		await this.updateGlobalState("taskHistory", history)
		return history
	}

	// global

	private async updateGlobalState(key: GlobalStateKey, value: any) {
		await this.context.globalState.update(key, value)
		this.outputChannel.appendLine(`Updated global state: ${key}`)
	}

	private async getGlobalState(key: GlobalStateKey) {
		const value = await this.context.globalState.get(key)
		this.outputChannel.appendLine(`Got global state: ${key}`)
		return value
	}

	// workspace

	private async updateWorkspaceState(key: string, value: any) {
		await this.context.workspaceState.update(key, value)
		this.outputChannel.appendLine(`Updated workspace state: ${key}`)
	}

	private async getWorkspaceState(key: string) {
		const value = await this.context.workspaceState.get(key)
		this.outputChannel.appendLine(`Got workspace state: ${key}`)
		return value
	}

	// secrets

	private async storeSecret(key: SecretKey, value?: string) {
		if (value) {
			await this.context.secrets.store(key, value)
			this.outputChannel.appendLine(`Stored secret: ${key}`)
		} else {
			await this.context.secrets.delete(key)
			this.outputChannel.appendLine(`Deleted secret: ${key}`)
		}
	}

	private async getSecret(key: SecretKey) {
		const value = await this.context.secrets.get(key)
		this.outputChannel.appendLine(`Got secret: ${key}`)
		return value
	}

	async updateExcludedFiles(files: string[]) {
		this.excludedFiles = new Set(files)
		await this.saveExcludedFiles()
		if (this.claudeDev) {
			this.claudeDev.setExcludedFiles(Array.from(this.excludedFiles))
		}
		this.outputChannel.appendLine("Updated excluded files")
	}

	async updateWhitelistedFiles(files: string[]) {
		this.whitelistedFiles = new Set(files)
		await this.saveWhitelistedFiles()
		if (this.claudeDev) {
			this.claudeDev.setWhitelistedFiles(Array.from(this.whitelistedFiles))
		}
		this.outputChannel.appendLine("Updated whitelisted files")
	}

	private async loadExcludedAndWhitelistedFiles() {
		const excludedFiles = await this.getGlobalState("excludedFiles") as string[] | undefined
		const whitelistedFiles = await this.getGlobalState("whitelistedFiles") as string[] | undefined
		
		this.excludedFiles = new Set(excludedFiles || [])
		this.whitelistedFiles = new Set(whitelistedFiles || [])
		this.outputChannel.appendLine("Loaded excluded and whitelisted files")
	}

	private async saveExcludedFiles() {
		await this.updateGlobalState("excludedFiles", Array.from(this.excludedFiles))
		this.outputChannel.appendLine("Saved excluded files")
	}

	private async saveWhitelistedFiles() {
		await this.updateGlobalState("whitelistedFiles", Array.from(this.whitelistedFiles))
		this.outputChannel.appendLine("Saved whitelisted files")
	}
}