const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const tooltipsFilePath = path.join(__dirname, 'tooltips.json');
    let tooltips = {};

    // Load the JSON file content
    try {
        const data = fs.readFileSync(tooltipsFilePath, 'utf-8');
        tooltips = JSON.parse(data);
    } catch (error) {
        console.error(`Error reading tooltips.json: ${tooltipsFilePath}`, error);
    }

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    function updateStatusBar(document, position) {
        const lineText = document.lineAt(position).text;
        const parts = lineText.split('||');
        const command = parts[0] + '||';

        if (tooltips[command] && Array.isArray(tooltips[command].parts)) {
            const syntaxLine = `${command}${tooltips[command].parts.map(part => `<${part.name}>`).join('||')}`;
            statusBarItem.text = syntaxLine;
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    }

    vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        const document = editor.document;
        const position = editor.selection.active;
        updateStatusBar(document, position);
    });

    function createDiagnostics(document) {
        const diagnostics = [];
        const text = document.getText();
        const lines = text.split('\n');

        lines.forEach((line, lineIndex) => {
            const parts = line.split('||');
            const command = parts[0] + '||';

            if (tooltips[command]) {
                const expectedPartsCount = tooltips[command].parts ? tooltips[command].parts.length + 1 : 1;

                if (tooltips[command].exception || (expectedPartsCount === 1 && parts.length === 2)) {
                    // Allow lines with zero parts to be valid if they contain exactly one occurrence of "||"
                    return;
                }

                if (Array.isArray(tooltips[command].parts) && parts.length !== expectedPartsCount) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, line.length);
                    const diagnostic = new vscode.Diagnostic(range, `Expected ${expectedPartsCount - 1} arguments, but found ${parts.length - 1}.`, vscode.DiagnosticSeverity.Error);
                    diagnostics.push(diagnostic);
                }
            }
        });

        return diagnostics;
    }

    const diagnosticsCollection = vscode.languages.createDiagnosticCollection('mff');

    vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;
        const diagnostics = createDiagnostics(document);
        diagnosticsCollection.set(document.uri, diagnostics);
    });

    vscode.workspace.onDidOpenTextDocument(document => {
        const diagnostics = createDiagnostics(document);
        diagnosticsCollection.set(document.uri, diagnostics);
    });

    vscode.workspace.textDocuments.forEach(document => {
        const diagnostics = createDiagnostics(document);
        diagnosticsCollection.set(document.uri, diagnostics);
    });

    let hoverProvider = vscode.languages.registerHoverProvider('mff', {
        provideHover(document, position, token) {
            const lineText = document.lineAt(position).text;
            const range = document.getWordRangeAtPosition(position, /(pt\|\||c\|\||h\|\||p\|\||t\|\|)/);
            if (range) {
                const word = document.getText(range);

                // Handle initial commands
                if (tooltips[word]) {
                    const tooltipData = tooltips[word];
                    const partsTooltip = tooltipData.parts
                        ? tooltipData.parts.map(part => `\\<${part.name}\\>`).join('||')
                        : null;

                    if (tooltipData.tooltip) {
                        const hoverContent = new vscode.MarkdownString(`**${tooltipData.tooltip.split('\n')[0]}**\n\n${tooltipData.tooltip.split('\n').slice(1).join('\n\n')}`);
                        if (partsTooltip) {
                            hoverContent.appendMarkdown(`\n\n${word}${partsTooltip}`);
                        }
                        return new vscode.Hover(hoverContent);
                    }
                }
            }

            // Handle subsequent parts of the line dynamically
            const parts = lineText.split('||');
            const command = parts[0] + '||';
            if (tooltips[command] && Array.isArray(tooltips[command].parts)) {
                let startPos = command.length; // Start position after the command
                for (let i = 1; i < parts.length; i++) {
                    const partKey = tooltips[command].parts[i - 1];
                    const endPos = startPos + parts[i].length;

                    if (position.character >= startPos && position.character <= endPos) {
                        const firstLine = `**[${tooltips[command].tooltip}] ${partKey.tooltip.split('\n')[0]}**`;
                        const restOfTooltip = partKey.tooltip.split('\n').slice(1).join('\n\n');
                        const hoverContent = new vscode.MarkdownString(`${firstLine}\n\n${restOfTooltip}`);
                        const partsSyntax = tooltips[command].parts.map(part => `\\<${part.name}\\>`).join('||');
                        const highlightedPartsSyntax = partsSyntax.replace(`\\<${partKey.name}\\>`, `**\\<${partKey.name}\\>**`);
                        hoverContent.appendMarkdown(`\n\n${command}${highlightedPartsSyntax}`);
                        return new vscode.Hover(hoverContent);
                    }

                    // Move startPos to next part (current end + length of ||)
                    startPos = endPos + 2;
                }
            }

            return null;
        }
    });

    context.subscriptions.push(hoverProvider, diagnosticsCollection, statusBarItem);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
