import * as React from 'react';

interface Props {
    section: any;
    vscode: any;
}

const SectionItem: React.FC<Props> = ({ section, vscode }) => {

    const handleOpenFile = () => {
        // Logic to determine file path. 
        // This is a placeholder. In a real scenario, we'd need the file path from the section data 
        // or construct it based on lesson/section IDs.
        // For now, we'll try to guess or use a property if it existed.
        // Since the section model from the web app doesn't strictly have a 'filePath', 
        // we might need to rely on the extension to know where to look, 
        // or we send a generic signal to the extension to "open the exercise file" for this section.

        vscode.postMessage({
            type: 'openExercise',
            section: section
        });
    };

    const containerStyle = {
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-widget-border)',
        borderRadius: '4px',
        overflow: 'hidden' as const
    };

    const titleStyle = {
        fontSize: '1.1em',
        fontWeight: 'bold',
        marginBottom: '0.5rem',
        color: 'var(--vscode-editor-foreground)'
    };

    const contentStyle = {
        lineHeight: '1.5',
        color: 'var(--vscode-editor-foreground)',
        overflow: 'auto' as const
    };

    const codeStyle = {
        backgroundColor: 'var(--vscode-textBlockQuote-background)',
        padding: '0.5rem',
        borderRadius: '3px',
        overflowX: 'auto' as const,
        fontSize: '0.9em',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap' as const,
        wordWrap: 'break-word' as const,
        maxWidth: '100%',
        display: 'block'
    };

    // Render rich HTML content from the lesson. Use carefully; content should be trusted or sanitized.
    const renderContent = (content: string) => {
        if (!content) return null;
        return <div dangerouslySetInnerHTML={{ __html: content }} />;
    };

    return (
        <div style={containerStyle}>
            <h3 style={titleStyle}>{section.title}</h3>

            <div style={contentStyle}>
                {section.type === 'text' && renderContent(section.content)}

                {section.type === 'image' && (
                    <img src={section.content} alt={section.title} style={{ maxWidth: '100%' }} />
                )}

                {(section.type === 'code' || section.type === 'interactive') && (
                    <div>
                        <div style={{ marginBottom: '10px' }}>
                            {renderContent(section.content)}
                        </div>
                        <button
                            onClick={handleOpenFile}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '2px'
                            }}
                        >
                            Open Exercise File
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SectionItem;
