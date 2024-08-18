export type HistoryItem = {
	id: string
	ts: number
	task: string
	tokensIn: number
	tokensOut: number
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	excludedFiles: string[]  // New property
	whitelistedFiles: string[]  // New property	
}
