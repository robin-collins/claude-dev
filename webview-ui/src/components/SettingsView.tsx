import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextArea, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useState } from "react"
import { ApiConfiguration } from "../../../src/shared/api"
import { validateApiConfiguration, validateMaxRequestsPerTask } from "../utils/validate"
import { vscode } from "../utils/vscode"
import ApiOptions from "./ApiOptions"
import { HistoryItem } from "../../../src/shared/HistoryItem"

type SettingsViewProps = {
    version: string
    apiConfiguration?: ApiConfiguration
    setApiConfiguration: React.Dispatch<React.SetStateAction<ApiConfiguration | undefined>>
    maxRequestsPerTask: string
    setMaxRequestsPerTask: React.Dispatch<React.SetStateAction<string>>
    customInstructions: string
    setCustomInstructions: React.Dispatch<React.SetStateAction<string>>
    approveReadFile: boolean
    setApproveReadFile: React.Dispatch<React.SetStateAction<boolean>>
    approveListFilesTopLevel: boolean
    setApproveListFilesTopLevel: React.Dispatch<React.SetStateAction<boolean>>
    approveListFilesRecursively: boolean
    setApproveListFilesRecursively: React.Dispatch<React.SetStateAction<boolean>>
    excludedFiles: string[]
    whitelistedFiles: string[]
    onUpdateExcludedFiles: (files: string[]) => void
    onUpdateWhitelistedFiles: (files: string[]) => void
    taskHistory: HistoryItem[]
    onDone: () => void
}

const SettingsView = ({
    version,
    apiConfiguration,
    setApiConfiguration,
    maxRequestsPerTask,
    setMaxRequestsPerTask,
    customInstructions,
    setCustomInstructions,
    approveReadFile,
    setApproveReadFile,
    approveListFilesTopLevel,
    setApproveListFilesTopLevel,
    approveListFilesRecursively,
    setApproveListFilesRecursively,
    excludedFiles,
    whitelistedFiles,
    onUpdateExcludedFiles,
    onUpdateWhitelistedFiles,
    taskHistory,
    onDone,
}: SettingsViewProps) => {
    const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
    const [maxRequestsErrorMessage, setMaxRequestsErrorMessage] = useState<string | undefined>(undefined)
    const [newFileInput, setNewFileInput] = useState<string>("")
    const [newFileListType, setNewFileListType] = useState<"excluded" | "whitelisted">("excluded")

    const handleSubmit = () => {
        const apiValidationResult = validateApiConfiguration(apiConfiguration)
        const maxRequestsValidationResult = validateMaxRequestsPerTask(maxRequestsPerTask)

        setApiErrorMessage(apiValidationResult)
        setMaxRequestsErrorMessage(maxRequestsValidationResult)

        if (!apiValidationResult && !maxRequestsValidationResult) {
            vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
            vscode.postMessage({ type: "maxRequestsPerTask", text: maxRequestsPerTask })
            vscode.postMessage({ type: "customInstructions", text: customInstructions })
            vscode.postMessage({ type: "approveReadFile", value: approveReadFile })
            vscode.postMessage({ type: "approveListFilesTopLevel", value: approveListFilesTopLevel })
            vscode.postMessage({ type: "approveListFilesRecursively", value: approveListFilesRecursively })
            onDone()
        }
    }

    useEffect(() => {
        setApiErrorMessage(undefined)
    }, [apiConfiguration])

    useEffect(() => {
        setMaxRequestsErrorMessage(undefined)
    }, [maxRequestsPerTask])

    const handleExcludedFileRemove = (file: string) => {
        const updatedExcludedFiles = excludedFiles.filter(f => f !== file)
        onUpdateExcludedFiles(updatedExcludedFiles)
    }

    const handleWhitelistedFileRemove = (file: string) => {
        const updatedWhitelistedFiles = whitelistedFiles.filter(f => f !== file)
        onUpdateWhitelistedFiles(updatedWhitelistedFiles)
    }

    const handleFileAdd = () => {
        if (newFileInput) {
            if (newFileListType === "excluded") {
                onUpdateExcludedFiles([...excludedFiles, newFileInput])
            } else {
                onUpdateWhitelistedFiles([...whitelistedFiles, newFileInput])
            }
            setNewFileInput("")
        }
    }

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: "10px 0px 0px 20px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "17px",
                    paddingRight: 17,
                }}>
                <h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>Settings</h3>
                <VSCodeButton onClick={handleSubmit}>Done</VSCodeButton>
            </div>
            <div
                style={{ flexGrow: 1, overflowY: "scroll", paddingRight: 8, display: "flex", flexDirection: "column" }}>
                <div style={{ marginBottom: 5 }}>
                    <ApiOptions
                        apiConfiguration={apiConfiguration}
                        setApiConfiguration={setApiConfiguration}
                        showModelOptions={true}
                    />
                    {apiErrorMessage && (
                        <p
                            style={{
                                margin: "-5px 0 12px 0",
                                fontSize: "12px",
                                color: "var(--vscode-errorForeground)",
                            }}>
                            {apiErrorMessage}
                        </p>
                    )}
                </div>

                <div style={{ marginBottom: 5 }}>
                    <VSCodeTextArea
                        value={customInstructions}
                        style={{ width: "100%" }}
                        rows={4}
                        placeholder={
                            'e.g. "Run unit tests at the end", "Use TypeScript with async/await", "Speak in Spanish"'
                        }
                        onInput={(e: any) => setCustomInstructions(e.target?.value || "")}>
                        <span style={{ fontWeight: "500" }}>Custom Instructions</span>
                    </VSCodeTextArea>
                    <p
                        style={{
                            fontSize: "12px",
                            marginTop: "5px",
                            color: "var(--vscode-descriptionForeground)",
                        }}>
                        These instructions are added to the end of the system prompt sent with every request.
                    </p>
                </div>

                <div>
                    <VSCodeTextField
                        value={maxRequestsPerTask}
                        style={{ width: "100%" }}
                        placeholder="20"
                        onInput={(e: any) => setMaxRequestsPerTask(e.target?.value)}>
                        <span style={{ fontWeight: "500" }}>Maximum # Requests Per Task</span>
                    </VSCodeTextField>
                    <p
                        style={{
                            fontSize: "12px",
                            marginTop: "5px",
                            color: "var(--vscode-descriptionForeground)",
                        }}>
                        If Claude Dev reaches this limit, it will pause and ask for your permission before making
                        additional requests.
                    </p>
                    {maxRequestsErrorMessage && (
                        <p
                            style={{
                                fontSize: "12px",
                                marginTop: "5px",
                                color: "var(--vscode-errorForeground)",
                            }}>
                            {maxRequestsErrorMessage}
                        </p>
                    )}
                </div>

                <div style={{ marginTop: 15 }}>
                    <h4 style={{ marginBottom: 10 }}>File Operation Approvals</h4>
                    <VSCodeCheckbox
                        checked={approveReadFile}
                        onChange={() => setApproveReadFile(!approveReadFile)}
                    >
                        Approve read_file operations
                    </VSCodeCheckbox>
                    <VSCodeCheckbox
                        checked={approveListFilesTopLevel}
                        onChange={() => setApproveListFilesTopLevel(!approveListFilesTopLevel)}
                    >
                        Approve list_files_top_level operations
                    </VSCodeCheckbox>
                    <VSCodeCheckbox
                        checked={approveListFilesRecursively}
                        onChange={() => setApproveListFilesRecursively(!approveListFilesRecursively)}
                    >
                        Approve list_files_recursively operations
                    </VSCodeCheckbox>
                    <p
                        style={{
                            fontSize: "12px",
                            marginTop: "5px",
                            color: "var(--vscode-descriptionForeground)",
                        }}>
                        When unchecked, the corresponding tool runs without user approval.
                    </p>
                </div>

                <div style={{ marginTop: 15 }}>
                    <h4 style={{ marginBottom: 10 }}>Excluded Files</h4>
                    <ul style={{ listStyleType: "none", padding: 0 }}>
                        {excludedFiles.map((file, index) => (
                            <li key={index} style={{ marginBottom: 5, display: "flex", alignItems: "center" }}>
                                <span style={{ marginRight: 10 }}>{file}</span>
                                <VSCodeButton appearance="icon" onClick={() => handleExcludedFileRemove(file)}>
                                    <span className="codicon codicon-trash"></span>
                                </VSCodeButton>
                            </li>
                        ))}
                    </ul>
                </div>

                <div style={{ marginTop: 15 }}>
                    <h4 style={{ marginBottom: 10 }}>Whitelisted Files</h4>
                    <ul style={{ listStyleType: "none", padding: 0 }}>
                        {whitelistedFiles.map((file, index) => (
                            <li key={index} style={{ marginBottom: 5, display: "flex", alignItems: "center" }}>
                                <span style={{ marginRight: 10 }}>{file}</span>
                                <VSCodeButton appearance="icon" onClick={() => handleWhitelistedFileRemove(file)}>
                                    <span className="codicon codicon-trash"></span>
                                </VSCodeButton>
                            </li>
                        ))}
                    </ul>
                </div>

                <div style={{ marginTop: 15 }}>
                    <h4 style={{ marginBottom: 10 }}>Add New File</h4>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <VSCodeTextField
                            value={newFileInput}
                            onInput={(e: any) => setNewFileInput(e.target?.value)}
                            placeholder="Enter file path"
                            style={{ flex: 1, marginRight: 10 }}
                        />
                        <VSCodeButton appearance="secondary" onClick={handleFileAdd}>
                            Add
                        </VSCodeButton>
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <VSCodeCheckbox
                            checked={newFileListType === "excluded"}
                            onChange={() => setNewFileListType("excluded")}
                        >
                            Add to Excluded Files
                        </VSCodeCheckbox>
                        <VSCodeCheckbox
                            checked={newFileListType === "whitelisted"}
                            onChange={() => setNewFileListType("whitelisted")}
                        >
                            Add to Whitelisted Files
                        </VSCodeCheckbox>
                    </div>
                </div>

                <div style={{ marginTop: 15 }}>
                    <h4 style={{ marginBottom: 10 }}>Task History</h4>
                    {taskHistory.map((task, index) => (
                        <div key={index} style={{ marginBottom: 15, border: "1px solid var(--vscode-input-border)", padding: 10 }}>
                            <h5 style={{ marginTop: 0 }}>Task: {task.task}</h5>
                            <p>Excluded Files: {task.excludedFiles?.join(", ") || "None"}</p>
                            <p>Whitelisted Files: {task.whitelistedFiles?.join(", ") || "None"}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div
                style={{
                    textAlign: "center",
                    color: "var(--vscode-descriptionForeground)",
                    fontSize: "12px",
                    lineHeight: "1.2",
                    marginTop: "auto",
                    padding: "10px 8px 15px 0px",
                }}>
                <p style={{ wordWrap: "break-word", margin: 0, padding: 0 }}>
                    If you have any questions or feedback, feel free to open an issue at{" "}
                    <VSCodeLink href="https://github.com/saoudrizwan/claude-dev" style={{ display: "inline" }}>
                        https://github.com/saoudrizwan/claude-dev
                    </VSCodeLink>
                </p>
                <p style={{ fontStyle: "italic", margin: "10px 0 0 0", padding: 0 }}>v{version}</p>
            </div>
        </div>
    )
}

export default SettingsView