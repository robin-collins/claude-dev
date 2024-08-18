# Claude Dev Update

## Update Requirements

### File Operation Security Requirements

1. **Initial File Read Approval**
   - Require user approval for the first read operation on each file.
   - This gives users the opportunity to deny access to sensitive files.

2. **Permanent Exclusion List**
   - When a user denies access to a file, add it to a permanent exclusion list.
   - Update the user interface to clearly communicate that denied files will be permanently excluded.
   - Store the exclusion list as part of the task history.

3. **Whitelist for Claude-created Files**
   - Automatically add files created by Claude to a whitelist.
   - These whitelisted files should not require approval for future read operations.
   - Store the whitelist as part of the task history.

4. **File Listing Behavior**
   - Continue to show all files in file lists, including those without read/write permissions.
   - Annotate files lacking read/write permissions to clearly indicate their restricted status.

5. **User Interface Updates**
   - Modify the UI to reflect these changes, including:
     - A prompt for first-time file read approval
     - Clear indication of permanently excluded files
     - Annotations for files with restricted permissions in file lists
   - Display the current state of excluded and whitelisted files for each task in the task history view.

6. **Performance Optimization**
   - Implement these security measures in a way that minimizes impact on workflow efficiency.
   - Ensure that repeated operations on approved files do not require re-approval.

7. **User Settings**
   - Provide user-configurable settings to manage the exclusion list and whitelist.
   - Allow users to review and modify these lists as needed.
   - Persist these settings across sessions and include them in task history.
  
8. **Task History Integration**

   - Store the excluded and whitelisted files as part of each task's history.
   - When resuming a task from history, restore the excluded and whitelisted file lists to their previous state.
   - Ensure that the task history view includes information about file permissions for each task.

9. **Synchronization**

   - Maintain synchronization between the ClaudeDevProvider, ClaudeDev instance, and the webview regarding excluded and whitelisted files.
   - Ensure that changes to file permissions are immediately reflected across all components of the extension.

## ~~1. src/ClaudeDev.ts~~

### Class: ClaudeDev

- [x] Add new class properties:
    - [x] excludedFiles: Set<string>
    - [x] whitelistedFiles: Set<string>

- [x] Update constructor:
    - [x] Initialize new properties (excludedFiles and whitelistedFiles)

- [x] Modify readFile(relPath: string) method:
    - [x] Check excludedFiles and whitelistedFiles before proceeding
    - [x] If not in either list, prompt user for approval via ClaudeDevProvider
    - [x] Handle approval response, updating lists accordingly

- [x] Update writeToFile(relPath: string, newContent: string, isLast: boolean) method:
    - [x] After successful write, add file path to whitelistedFiles

- [x] Add new method addToExclusionList(filePath: string):
    - [x] Add file to excludedFiles Set
    - [x] Remove from whitelistedFiles if present

- [x] Add new method addToWhitelist(filePath: string):
    - [x] Add file to whitelistedFiles Set
    - [x] Remove from excludedFiles if present

- [x] Modify listFilesTopLevel(relDirPath: string) and listFilesRecursive(relDirPath: string) methods:
    - [x] Update return value to include permission status for each file
    - [x] Modify formatFilesList method to include this information

## ~~2. src/providers/ClaudeDevProvider.ts~~

### Class: ClaudeDevProvider
- [x] Add new class properties:
    - [x] excludedFiles: Set<string>
    - [x] whitelistedFiles: Set<string>

- [x] Update handleWebviewAskResponse method:
    - [x] Add case for file read approval responses
    - [x] Update ClaudeDev's file lists based on response

- [x] Add new method updateExcludedFiles(files: string[]):
    - [x] Update excludedFiles Set
    - [x] Sync with ClaudeDev instance

- [x] Add new method updateWhitelistedFiles(files: string[]):
    - [x] Update whitelistedFiles Set
    - [x] Sync with ClaudeDev instance

- [x] Modify getState() method:
    - [x] Include excludedFiles and whitelistedFiles in returned state

- [x] Update updateTaskHistory(item: HistoryItem) method:
    - [x] Include excludedFiles and whitelistedFiles in the history item

- [x] Modify initClaudeDevWithHistoryItem method:
    - [x] Restore excludedFiles and whitelistedFiles from history item

- [x] Update postStateToWebview method:
    - [x] Include excludedFiles and whitelistedFiles in the state sent to webview

- [x] Add private method loadExcludedAndWhitelistedFiles():
    - [x] Load excluded and whitelisted files from global state

- [x] Add private methods saveExcludedFiles() and saveWhitelistedFiles():
    - [x] Save excluded and whitelisted files to global state

- [x] Update constructor:
    - [x] Call loadExcludedAndWhitelistedFiles() to initialize file lists

## 2.1 ~~src/shared/HistoryItem.ts~~
- [x] Update HistoryItem type:
    - [x] Add excludedFiles: string[] property
    - [x] Add whitelistedFiles: string[] property

## 3. ~~webview-ui/src/components/SettingsView.tsx~~

### Component: SettingsView

- [x] Add new component properties:
    - [x] excludedFiles: string[]
    - [x] whitelistedFiles: string[]
    - [x] onUpdateExcludedFiles: (files: string[]) => void
    - [x] onUpdateWhitelistedFiles: (files: string[]) => void
    - [x] taskHistory: HistoryItem[]

- [x] Add new UI elements:
    - [x] Lists displaying excluded and whitelisted files
    - [x] Buttons to remove files from each list
    - [x] Input field to manually add files to either list
    - [x] Task history view showing excluded and whitelisted files for each task

- [x] Add new event handlers:
    - [x] handleExcludedFileRemove(file: string)
    - [x] handleWhitelistedFileRemove(file: string)
    - [x] handleFileAdd(file: string, listType: 'excluded' | 'whitelisted')

## 4. ~~webview-ui/src/App.tsx~~

### Component: App
- [x] Add new state variables:
    - [x] excludedFiles: string[]
    - [x] whitelistedFiles: string[]
    - [x] taskHistory: HistoryItem[]

- [x] Add new methods:
    - [x] handleTaskResume(taskId: string)
    - [x] handleTaskExport(taskId: string)

- [x] Update handleMessage method:
    - [x] Add case for updating excluded and whitelisted files

- [x] Update component rendering:
    - [x] Pass new properties to SettingsView component
    - [x] Pass new properties to ChatView component

## 5. ~~src/shared/ExtensionMessage.ts~~

### Interface: ExtensionState

- [x] Add new interface properties:
    - [x] excludedFiles: string[]
    - [x] whitelistedFiles: string[]
    - [x] taskHistory: HistoryItem[]

## 6. ~~src/shared/WebviewMessage.ts~~

### Interface: WebviewMessage

- [x] Add new message types:
    - [x] 'fileReadApproval'
    - [x] 'updateExcludedFiles'
    - [x] 'updateWhitelistedFiles'
    - [x] 'resumeTask'
    - [x] 'exportTask'

- [x] Add corresponding properties for each new type:
    - [x] For 'fileReadApproval': filePath: string, approved: boolean
    - [x] For 'updateExcludedFiles': files: string[]
    - [x] For 'updateWhitelistedFiles': files: string[]
    - [x] For 'resumeTask': taskId: string
    - [x] For 'exportTask': taskId: string

## 7. ~~webview-ui/src/components/ChatView.tsx~~

### Component: ChatView

- [x] Add new component properties:
    - [x] excludedFiles: string[]
    - [x] whitelistedFiles: string[]
    - [x] onTaskResume: (taskId: string) => void

- [x] Add new UI elements:
    - [x] Task history view with options to resume or export tasks

- [x] Add new state variable:
    - [x] pendingFileApproval: string | null

- [x] Add new method handleFileReadApproval(filePath: string, approved: boolean):
    - [x] Send approval message to extension

- [x] Add new method handleTaskResume(taskId: string):
    - [x] Call onTaskResume prop with taskId

- [x] Update renderContent method:
    - [x] Display file read approval prompts

- [x] Modify file listing display logic:
    - [x] Show annotations for restricted files

## 8. webview-ui/src/components/ChatRow.tsx

### Component: ChatRow

- [x] Add new component properties:
    - [x] excludedFiles: string[]
    - [x] whitelistedFiles: string[]

- [x] Update rendering logic for file listings:
    - [x] Add visual indicators for files in excludedFiles (e.g., red icon)
    - [x] Add visual indicators for files in whitelistedFiles (e.g., green icon)
    - [x] Add tooltips explaining file status

## 9. webiview-ui/src/components/HistoryView.tsx (New Component)

### Component: HistoryView

- [x] Create new component for displaying task history
- [x] Add component properties:
    - [x] taskHistory: HistoryItem[]
    - [x] onTaskResume: (taskId: string) => void
    - [x] onTaskExport: (taskId: string) => void

- [x] Implement UI for displaying task history:
    - [x] List of tasks with timestamps and descriptions
    - [x] Display excluded and whitelisted files for each task
    - [x] Add buttons for resuming and exporting tasks

- [x] Add event handlers:
    - [x] handleTaskResume(taskId: string)
    - [x] handleTaskExport(taskId: string)