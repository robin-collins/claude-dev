import * as vscode from "vscode";
import { ClaudeDevProvider } from "./providers/ClaudeDevProvider";

/*
Built using https://github.com/microsoft/vscode-webview-ui-toolkit

Inspired by
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra

*/

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Claude Dev");
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine("Claude Dev extension activated");

  const sidebarProvider = new ClaudeDevProvider(context, outputChannel);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ClaudeDevProvider.sideBarId, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  outputChannel.appendLine("Webview provider registered");

  context.subscriptions.push(
    vscode.commands.registerCommand("claude-dev.plusButtonTapped", async () => {
      outputChannel.appendLine("Plus button tapped");
      await sidebarProvider.clearTask();
      await sidebarProvider.postStateToWebview();
      await sidebarProvider.postMessageToWebview({ type: "action", action: "chatButtonTapped" });
    })
  );

  const openClaudeDevInNewTab = () => {
    outputChannel.appendLine("Opening Claude Dev in new tab");
    const tabProvider = new ClaudeDevProvider(context, outputChannel);
    const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0));
    const targetCol = Math.max(lastCol + 1, 1);
    const panel = vscode.window.createWebviewPanel(ClaudeDevProvider.tabPanelId, "Claude Dev", targetCol, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png");
    tabProvider.resolveWebviewView(panel);

    new Promise((resolve) => setTimeout(resolve, 100)).then(() => {
      vscode.commands.executeCommand("workbench.action.lockEditorGroup");
    });
  };

  context.subscriptions.push(vscode.commands.registerCommand("claude-dev.popoutButtonTapped", openClaudeDevInNewTab));
  context.subscriptions.push(vscode.commands.registerCommand("claude-dev.openInNewTab", openClaudeDevInNewTab));

  context.subscriptions.push(
    vscode.commands.registerCommand("claude-dev.settingsButtonTapped", () => {
      outputChannel.appendLine("Settings button tapped");
      sidebarProvider.postMessageToWebview({ type: "action", action: "settingsButtonTapped" });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claude-dev.historyButtonTapped", () => {
      outputChannel.appendLine("History button tapped");
      sidebarProvider.postMessageToWebview({ type: "action", action: "historyButtonTapped" });
    })
  );

  const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return Buffer.from(uri.query, "base64").toString("utf-8");
    }
  })();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("claude-dev-diff", diffContentProvider)
  );

  outputChannel.appendLine("Claude Dev extension activation completed");
}

// This method is called when your extension is deactivated
export function deactivate() {
  outputChannel.appendLine("Claude Dev extension deactivated");
}
