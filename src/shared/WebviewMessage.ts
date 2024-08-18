import { ApiConfiguration, ApiProvider } from "./api"

export interface WebviewMessage {
	type:
		| "apiConfiguration"
		| "maxRequestsPerTask"
		| "customInstructions"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "approveReadFile"
		| "approveListFilesTopLevel"
		| "approveListFilesRecursively"		
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "fileReadApproval"
		| "updateExcludedFiles"
		| "updateWhitelistedFiles"
		| "resumeTask"
		| "exportTask"
	text?: string
	askResponse?: ClaudeAskResponse
	apiConfiguration?: ApiConfiguration
	images?: string[]
	value?: boolean  // Add this line for the new approval settings	
	filePath?: string
	approved?: boolean
	files?: string[]
	taskId?: string
}

export type ClaudeAskResponse = "yesButtonTapped" | "noButtonTapped" | "messageResponse"
