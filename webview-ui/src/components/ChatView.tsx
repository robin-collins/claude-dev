import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import vsDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import DynamicTextArea from "react-textarea-autosize";
import { useEvent, useMount } from "react-use";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ClaudeAsk, ClaudeMessage, ExtensionMessage } from "../../../src/shared/ExtensionMessage";
import { getApiMetrics } from "../../../src/shared/getApiMetrics";
import { combineApiRequests } from "../../../src/shared/combineApiRequests";
import { combineCommandSequences } from "../../../src/shared/combineCommandSequences";
import { getSyntaxHighlighterStyleFromTheme } from "../utils/getSyntaxHighlighterStyleFromTheme";
import { vscode } from "../utils/vscode";
import Announcement from "./Announcement";
import ChatRow from "./ChatRow";
import HistoryPreview from "./HistoryPreview";
import TaskHeader from "./TaskHeader";
import Thumbnails from "./Thumbnails";
import { HistoryItem } from "../../../src/shared/HistoryItem";
import TaskHistoryView from "./TaskHistoryView";

interface ChatViewProps {
  version: string;
  messages: ClaudeMessage[];
  taskHistory: HistoryItem[];
  isHidden: boolean;
  vscodeThemeName?: string;
  showAnnouncement: boolean;
  selectedModelSupportsImages: boolean;
  selectedModelSupportsPromptCache: boolean;
  hideAnnouncement: () => void;
  showHistoryView: () => void;
  excludedFiles: string[];
  whitelistedFiles: string[];
  onTaskResume: (taskId: string) => void;
  onTaskExport: (taskId: string) => void;
}

const MAX_IMAGES_PER_MESSAGE = 20; // Anthropic limits to 20 images

const ChatView = ({
  version,
  messages,
  taskHistory,
  isHidden,
  vscodeThemeName,
  showAnnouncement,
  selectedModelSupportsImages,
  selectedModelSupportsPromptCache,
  hideAnnouncement,
  showHistoryView,
  excludedFiles,
  whitelistedFiles,
  onTaskResume,
  onTaskExport,
}: ChatViewProps) => {
  const task = messages.length > 0 ? messages[0] : undefined;
  const modifiedMessages = useMemo(() => {
    if (messages.length === 0) return [];
    const combinedCommands = combineCommandSequences(messages.slice(1));
    const combinedApiRequests = combineApiRequests(combinedCommands);
    return combinedApiRequests;
  }, [messages]);

  const apiMetrics = useMemo(() => {
    return getApiMetrics(modifiedMessages);
  }, [modifiedMessages]);

  const [inputValue, setInputValue] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [textAreaDisabled, setTextAreaDisabled] = useState(false);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [thumbnailsHeight, setThumbnailsHeight] = useState(0);

  const [claudeAsk, setClaudeAsk] = useState<ClaudeAsk | undefined>(undefined);

  const [enableButtons, setEnableButtons] = useState<boolean>(false);
  const [primaryButtonText, setPrimaryButtonText] = useState<string | undefined>(undefined);
  const [secondaryButtonText, setSecondaryButtonText] = useState<string | undefined>(undefined);
  const [syntaxHighlighterStyle, setSyntaxHighlighterStyle] = useState(vsDarkPlus);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [pendingFileApproval, setPendingFileApproval] = useState<string | null>(null);

  const toggleRowExpansion = (ts: number) => {
    setExpandedRows((prev) => ({
      ...prev,
      [ts]: !prev[ts],
    }));
  };

  useEffect(() => {
    if (!vscodeThemeName) return;
    const theme = getSyntaxHighlighterStyleFromTheme(vscodeThemeName);
    if (theme) {
      setSyntaxHighlighterStyle(theme);
    }
  }, [vscodeThemeName]);

  useEffect(() => {
    const lastMessage = messages.length > 0 ? messages.at(-1) : undefined;
    const secondLastMessage = messages.length > 1 ? messages.at(-2) : undefined;
    if (lastMessage) {
      switch (lastMessage.type) {
        case "ask":
          switch (lastMessage.ask) {
            case "request_limit_reached":
              setTextAreaDisabled(true);
              setClaudeAsk("request_limit_reached");
              setEnableButtons(true);
              setPrimaryButtonText("Proceed");
              setSecondaryButtonText("Start New Task");
              break;
            case "api_req_failed":
              setTextAreaDisabled(true);
              setClaudeAsk("api_req_failed");
              setEnableButtons(true);
              setPrimaryButtonText("Retry");
              setSecondaryButtonText("Start New Task");
              break;
            case "followup":
              setTextAreaDisabled(false);
              setClaudeAsk("followup");
              setEnableButtons(false);
              break;
            case "tool":
              setTextAreaDisabled(false);
              setClaudeAsk("tool");
              setEnableButtons(true);
              setPrimaryButtonText("Approve");
              setSecondaryButtonText("Reject");
              break;
            case "command":
              setTextAreaDisabled(false);
              setClaudeAsk("command");
              setEnableButtons(true);
              setPrimaryButtonText("Run Command");
              setSecondaryButtonText("Reject");
              break;
            case "command_output":
              setTextAreaDisabled(false);
              setClaudeAsk("command_output");
              setEnableButtons(true);
              setPrimaryButtonText("Exit Command");
              setSecondaryButtonText(undefined);
              break;
            case "completion_result":
              setTextAreaDisabled(false);
              setClaudeAsk("completion_result");
              setEnableButtons(true);
              setPrimaryButtonText("Start New Task");
              setSecondaryButtonText(undefined);
              break;
            case "resume_task":
              setTextAreaDisabled(false);
              setClaudeAsk("resume_task");
              setEnableButtons(true);
              setPrimaryButtonText("Resume Task");
              setSecondaryButtonText(undefined);
              break;
            case "resume_completed_task":
              setTextAreaDisabled(false);
              setClaudeAsk("resume_completed_task");
              setEnableButtons(true);
              setPrimaryButtonText("Start New Task");
              setSecondaryButtonText(undefined);
              break;
          }
          break;
        case "say":
          switch (lastMessage.say) {
            case "api_req_started":
              if (secondLastMessage?.ask === "command_output") {
                setInputValue("");
                setTextAreaDisabled(true);
                setSelectedImages([]);
                setClaudeAsk(undefined);
                setEnableButtons(false);
              }
              break;
          }
          break;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      setTextAreaDisabled(false);
      setClaudeAsk(undefined);
      setEnableButtons(false);
      setPrimaryButtonText(undefined);
      setSecondaryButtonText(undefined);
    }
  }, [messages.length]);

  const handleSendMessage = () => {
    const text = inputValue.trim();
    if (text || selectedImages.length > 0) {
      if (messages.length === 0) {
        vscode.postMessage({ type: "newTask", text, images: selectedImages });
      } else if (claudeAsk) {
        switch (claudeAsk) {
          case "followup":
          case "tool":
          case "command":
          case "command_output":
          case "completion_result":
          case "resume_task":
          case "resume_completed_task":
            vscode.postMessage({
              type: "askResponse",
              askResponse: "messageResponse",
              text,
              images: selectedImages,
            });
            break;
        }
      }
      setInputValue("");
      setTextAreaDisabled(true);
      setSelectedImages([]);
      setClaudeAsk(undefined);
      setEnableButtons(false);
    }
  };

  const handlePrimaryButtonClick = () => {
    switch (claudeAsk) {
      case "request_limit_reached":
      case "api_req_failed":
      case "command":
      case "command_output":
      case "tool":
      case "resume_task":
        vscode.postMessage({ type: "askResponse", askResponse: "yesButtonTapped" });
        break;
      case "completion_result":
      case "resume_completed_task":
        startNewTask();
        break;
    }
    setTextAreaDisabled(true);
    setClaudeAsk(undefined);
    setEnableButtons(false);
  };

  const handleSecondaryButtonClick = () => {
    switch (claudeAsk) {
      case "request_limit_reached":
      case "api_req_failed":
        startNewTask();
        break;
      case "command":
      case "tool":
        vscode.postMessage({ type: "askResponse", askResponse: "noButtonTapped" });
        break;
    }
    setTextAreaDisabled(true);
    setClaudeAsk(undefined);
    setEnableButtons(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleTaskCloseButtonClick = () => {
    startNewTask();
  };

  const startNewTask = () => {
    vscode.postMessage({ type: "clearTask" });
  };

  const selectImages = () => {
    vscode.postMessage({ type: "selectImages" });
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (shouldDisableImages) {
      e.preventDefault();
      return;
    }

    const items = e.clipboardData.items;
    const acceptedTypes = ["png", "jpeg", "webp"];
    const imageItems = Array.from(items).filter((item) => {
      const [type, subtype] = item.type.split("/");
      return type === "image" && acceptedTypes.includes(subtype);
    });
    if (imageItems.length > 0) {
      e.preventDefault();
      const imagePromises = imageItems.map((item) => {
        return new Promise<string | null>((resolve) => {
          const blob = item.getAsFile();
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.error) {
              console.error("Error reading file:", reader.error);
              resolve(null);
            } else {
              const result = reader.result;
              resolve(typeof result === "string" ? result : null);
            }
          };
          reader.readAsDataURL(blob);
        });
      });
      const imageDataArray = await Promise.all(imagePromises);
      const dataUrls = imageDataArray.filter((dataUrl): dataUrl is string => dataUrl !== null);
      if (dataUrls.length > 0) {
        setSelectedImages((prevImages) => [...prevImages, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE));
      } else {
        console.warn("No valid images were processed");
      }
    }
  };

  useEffect(() => {
    if (selectedImages.length === 0) {
      setThumbnailsHeight(0);
    }
  }, [selectedImages]);

  const handleThumbnailsHeightChange = useCallback((height: number) => {
    setThumbnailsHeight(height);
  }, []);

  const handleMessage = useCallback(
    (e: MessageEvent) => {
      const message: ExtensionMessage = e.data;
      switch (message.type) {
        case "action":
          switch (message.action!) {
            case "didBecomeVisible":
              if (!isHidden && !textAreaDisabled && !enableButtons) {
                textAreaRef.current?.focus();
              }
              break
          }
          break;
        case "selectedImages":
          const newImages = message.images ?? [];
          if (newImages.length > 0) {
            setSelectedImages((prevImages) =>
              [...prevImages, ...newImages].slice(0, MAX_IMAGES_PER_MESSAGE)
            );
          }
          break;
      }
    },
    [isHidden, textAreaDisabled, enableButtons]
  );

  useEvent("message", handleMessage);

  useMount(() => {
    textAreaRef.current?.focus();
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isHidden && !textAreaDisabled && !enableButtons) {
        textAreaRef.current?.focus();
      }
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, [isHidden, textAreaDisabled, enableButtons]);

  const visibleMessages = useMemo(() => {
    return modifiedMessages.filter((message) => {
      switch (message.ask) {
        case "completion_result":
          if (message.text === "") {
            return false;
          }
          break;
        case "api_req_failed":
        case "resume_task":
        case "resume_completed_task":
          return false;
      }
      switch (message.say) {
        case "api_req_finished":
        case "api_req_retried":
          return false;
        case "text":
          if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
            return false;
          }
          break;
      }
      return true;
    });
  }, [modifiedMessages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "smooth" });
    }, 50);

    return () => clearTimeout(timer);
  }, [visibleMessages]);

  const [placeholderText, isInputPipingToStdin] = useMemo(() => {
    if (messages.length > 0 && messages.at(-1)?.ask === "command_output") {
      return ["Type input to command stdin...", true];
    }
    const text = task ? "Type a message..." : "Type your task here...";
    return [text, false];
  }, [task, messages]);

  const shouldDisableImages =
    !selectedModelSupportsImages ||
    textAreaDisabled ||
    selectedImages.length >= MAX_IMAGES_PER_MESSAGE ||
    isInputPipingToStdin;

  const handleFileReadApproval = (filePath: string, approved: boolean) => {
    vscode.postMessage({ type: "fileReadApproval", filePath, approved });
    setPendingFileApproval(null);
  };

  const handleTaskResume = (taskId: string) => {
    onTaskResume(taskId);
  };

  const handleTaskExport = (taskId: string) => {
    onTaskExport(taskId);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: isHidden ? "none" : "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
      {task ? (
        <TaskHeader
          task={task}
          tokensIn={apiMetrics.totalTokensIn}
          tokensOut={apiMetrics.totalTokensOut}
          doesModelSupportPromptCache={selectedModelSupportsPromptCache}
          cacheWrites={apiMetrics.totalCacheWrites}
          cacheReads={apiMetrics.totalCacheReads}
          totalCost={apiMetrics.totalCost}
          onClose={handleTaskCloseButtonClick}
          isHidden={isHidden}
        />
      ) : (
        <>
          {showAnnouncement && <Announcement version={version} hideAnnouncement={hideAnnouncement} />}
          <div style={{ padding: "0 20px", flexGrow: taskHistory.length > 0 ? undefined : 1 }}>
            <h2>What can I do for you?</h2>
            <p>
              Thanks to{" "}
              <VSCodeLink
                href="https://www-cdn.anthropic.com/fed9cc193a14b84131812372d8d5857f8f304c52/Model_Card_Claude_3_Addendum.pdf"
                style={{ display: "inline" }}>
                Claude 3.5 Sonnet's agentic coding capabilities,
              </VSCodeLink>{" "}
              I can handle complex software development tasks step-by-step. With tools that let me create
              & edit files, explore complex projects, and execute terminal commands (after you grant
              permission), I can assist you in ways that go beyond simple code completion or tech support.
            </p>
          </div>
          {taskHistory.length > 0 && (
            <TaskHistoryView
              taskHistory={taskHistory}
              onTaskResume={handleTaskResume}
              onTaskExport={handleTaskExport}
            />
          )}
        </>
      )}
      {task && (
        <>
          <Virtuoso
            ref={virtuosoRef}
            className="scrollable"
            style={{
              flexGrow: 1,
              overflowY: "scroll",
            }}
            increaseViewportBy={{ top: 0, bottom: Number.MAX_SAFE_INTEGER }}
            data={visibleMessages}
            itemContent={(index, message) => (
              <ChatRow
                key={message.ts}
                message={message}
                syntaxHighlighterStyle={syntaxHighlighterStyle}
                isExpanded={expandedRows[message.ts] || false}
                onToggleExpand={() => toggleRowExpansion(message.ts)}
                lastModifiedMessage={modifiedMessages.at(-1)}
                isLast={index === visibleMessages.length - 1}
                excludedFiles={excludedFiles}
                whitelistedFiles={whitelistedFiles}
              />
            )}
          />
          {pendingFileApproval && (
            <div style={{ padding: "10px 15px", backgroundColor: "var(--vscode-editor-background)" }}>
              <p>Claude is requesting to read the file: {pendingFileApproval}</p>
              <VSCodeButton onClick={() => handleFileReadApproval(pendingFileApproval, true)}>
                Approve
              </VSCodeButton>
              <VSCodeButton onClick={() => handleFileReadApproval(pendingFileApproval, false)}>
                Deny
              </VSCodeButton>
            </div>
          )}
          <div
            style={{
              padding: "10px 15px",
              opacity: textAreaDisabled ? 0.5 : 1,
              position: "relative",
              display: "flex",
            }}>
            {!isTextAreaFocused && (
              <div
                style={{
                  position: "absolute",
                  inset: "10px 15px",
                  border: "1px solid var(--vscode-input-border)",
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
            )}
            <DynamicTextArea
              ref={textAreaRef}
              value={inputValue}
              disabled={textAreaDisabled}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsTextAreaFocused(true)}
              onBlur={() => setIsTextAreaFocused(false)}
              onPaste={handlePaste}
              onHeightChange={() =>
                virtuosoRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "auto" })
              }
              placeholder={placeholderText}
              maxRows={10}
              autoFocus={true}
              style={{
                width: "100%",
                boxSizing: "border-box",
                backgroundColor: "var(--vscode-input-background)",
                color: "var(--vscode-input-foreground)",
                borderRadius: 2,
                fontFamily: "var(--vscode-font-family)",
                fontSize: "var(--vscode-editor-font-size)",
                lineHeight: "var(--vscode-editor-line-height)",
                resize: "none",
                overflow: "hidden",
                borderTop: "9px solid transparent",
                borderBottom: `${thumbnailsHeight + 9}px solid transparent`,
                borderRight: "54px solid transparent",
                borderLeft: "9px solid transparent",
                padding: 0,
                cursor: textAreaDisabled ? "not-allowed" : undefined,
                flex: 1,
              }}
            />
            {selectedImages.length > 0 && (
              <Thumbnails
                images={selectedImages}
                setImages={setSelectedImages}
                onHeightChange={handleThumbnailsHeightChange}
                style={{
                  position: "absolute",
                  paddingTop: 4,
                  bottom: 14,
                  left: 22,
                  right: 67,
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                right: 20,
                bottom: 14.5,
                display: "flex",
                alignItems: "flex-end",
                height: "calc(100% - 20px)",
              }}>
              <VSCodeButton
                disabled={shouldDisableImages}
                appearance="icon"
                aria-label="Attach Images"
                onClick={selectImages}
                style={{ marginRight: "2px" }}>
                <span
                  className="codicon codicon-device-camera"
                  style={{ fontSize: 18, marginLeft: -2, marginTop: -1 }}></span>
              </VSCodeButton>
              <VSCodeButton
                disabled={textAreaDisabled}
                appearance="icon"
                aria-label="Send Message"
                onClick={handleSendMessage}>
                <span className="codicon codicon-send" style={{ fontSize: 16 }}></span>
              </VSCodeButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatView;
