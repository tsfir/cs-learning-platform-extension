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
        borderRadius: '4px'
    };

    const titleStyle = {
        fontSize: '1.1em',
        fontWeight: 'bold',
        marginBottom: '0.5rem',
        color: 'var(--vscode-editor-foreground)'
    };

    const contentStyle = {
        lineHeight: '1.5',
        color: 'var(--vscode-editor-foreground)'
    };

    // Simple Markdown renderer placeholder (since we don't have a markdown lib installed yet)
    // In a real app we'd use react-markdown
    const renderContent = (content: string) => {
        return <div dangerouslySetInnerHTML={{ __html: content }} />;
        // WARNING: This is unsafe without sanitization, but for internal content it's "okay" for a prototype.
        // Ideally we should use a markdown library.
    };

    return (
        <div style={containerStyle}>
            <h3 style={titleStyle}>{section.title}</h3>

            <div style={contentStyle}>
                {section.type === 'text' && (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{section.content}</div>
                )}

                {section.type === 'image' && (
                    <img src={section.content} alt={section.title} style={{ maxWidth: '100%' }} />
                )}

                {(section.type === 'code' || section.type === 'interactive') && (
                    <div>
                        <p style={{ fontStyle: 'italic', marginBottom: '10px' }}>
                            {section.content}
                        </p>
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
