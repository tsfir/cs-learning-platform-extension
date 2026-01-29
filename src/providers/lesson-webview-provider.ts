import * as vscode from 'vscode';
import * as path from 'path';
import { Section } from '../models'; // No slash at start

export class LessonWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'csLearningPlatform.lessonView';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    private _currentContext: {
        courseId: string;
        topicId: string;
        lessonId: string;
    } | undefined;

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            // Restrict the webview to only load resources from the `dist` directory
            localResourceRoots: [
                vscode.Uri.file(path.join(this._extensionUri.fsPath, 'dist'))
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'openExercise':
                    if (this._currentContext && message.section) {
                        vscode.commands.executeCommand(
                            'csLearningPlatform.openExercise',
                            this._currentContext.courseId,
                            this._currentContext.topicId,
                            this._currentContext.lessonId,
                            message.section
                        );
                    }
                    break;
                case 'onInfo':
                    vscode.window.showInformationMessage(message.value);
                    break;
                case 'onError':
                    vscode.window.showErrorMessage(message.value);
                    break;
            }
        });
    }

    public updateLessonContent(
        courseId: string,
        topicId: string,
        lessonId: string,
        lessonName: string,
        sections: Section[]
    ) {
        this._currentContext = { courseId, topicId, lessonId };

        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateContext',
                payload: {
                    lessonName,
                    sections
                }
            });
            // Also make sure it's visible
            this._view.show?.(true);
        }
    }

    private _openFile(filePath: string) {
        // Check if absolute or relative
        // This part depends on how sections define the file path. 
        // For now, let's assume it's relative to the workspace root if not absolute.

        // Note: In the web app, 'code' sections might just contain snippet text, 
        // but 'exercise' type lessons might have file paths.
        // If the section just has "content" (code string), we can't "open file".
        // But the requirements said "Open Button to open the relevant file". 
        // I will assume for now we might look for a file logic later, 
        // or maybe we create a temp file? 
        // Let's assume the message payload sends a valid path or we handle it.

        if (!filePath) return;

        const openPath = vscode.Uri.file(filePath); // Simplify for now
        vscode.workspace.openTextDocument(openPath).then(doc => {
            vscode.window.showTextDocument(doc);
        }, err => {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <!--
            Use a content security policy to only allow loading images from https or from our extension directory,
            and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lesson View</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
