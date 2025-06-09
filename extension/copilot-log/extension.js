const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // テキストドキュメント変更時にフック
    let disposable = vscode.workspace.onDidChangeTextDocument(event => {
        for (const change of event.contentChanges) {
            // 20文字以上 または 複数行 の挿入を「AI補完らしい」とみなして記録
            if (change.text.length > 20 || change.text.includes('\n')) {
                const logLine = `[${new Date().toISOString()}] [${event.document.fileName}]:\n${change.text}\n---\n`;
                const storagePath = context.globalStorageUri.fsPath;
                const logPath = path.join(storagePath, 'copilot-log.txt');

                try {
                    // ストレージディレクトリを作成（なければ）
                    fs.mkdirSync(storagePath, { recursive: true });
                } catch (e) { /* already exists */ }

                // ログファイルに追記
                fs.appendFileSync(logPath, logLine, 'utf8');
            }
        }
    });
    context.subscriptions.push(disposable);

    // コマンドでログファイルを開く
    let openLog = vscode.commands.registerCommand('copilotLogger.openLog', function () {
        const logPath = path.join(context.globalStorageUri.fsPath, 'copilot-log.txt');
        vscode.window.showTextDocument(vscode.Uri.file(logPath));
    });
    context.subscriptions.push(openLog);
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;
