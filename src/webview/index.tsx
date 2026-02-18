import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import LessonContent from './components/LessonContent';

// Declare vscode API
declare global {
    interface Window {
        acquireVsCodeApi: () => any;
    }
}

const vscode = window.acquireVsCodeApi();

const App = () => {
    const [context, setContext] = React.useState<{ lessonName: string, sections: any[] } | null>(null);
    const [isLoggedIn, setIsLoggedIn] = React.useState<boolean>(true); // Assume logged in initially

    React.useEffect(() => {
        // Handle messages from the extension
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'updateContext') {
                setContext(message.payload);
            } else if (message.type === 'authState') {
                setIsLoggedIn(message.payload.isLoggedIn);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleLogin = () => {
        vscode.postMessage({ type: 'login' });
    };

    if (!isLoggedIn) {
        return (
            <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '80vh'
            }}>
                <div style={{
                    fontSize: '2rem',
                    marginBottom: '1rem',
                    color: 'var(--vscode-editor-foreground)'
                }}>
                    🚀
                </div>
                <h2 style={{
                    marginBottom: '0.5rem',
                    color: 'var(--vscode-editor-foreground)'
                }}>
                    Ready to Learn?
                </h2>
                <p style={{
                    marginBottom: '2rem',
                    color: 'var(--vscode-descriptionForeground)',
                    maxWidth: '280px',
                    lineHeight: '1.5'
                }}>
                    Sign in to access your interactive computer science courses and exercises.
                </p>
                <button
                    onClick={handleLogin}
                    style={{
                        padding: '10px 24px',
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--vscode-button-hoverBackground)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--vscode-button-background)')}
                >
                    Sign In
                </button>
            </div>
        );
    }

    if (!context) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
                <h3 style={{ fontWeight: 'normal' }}>Select a lesson to view content</h3>
            </div>
        );
    }

    return (
        <div className="p-4" style={{ color: 'var(--vscode-editor-foreground)' }}>
            <h1 style={{
                fontSize: '1.5rem',
                marginBottom: '1.5rem',
                borderBottom: '1px solid var(--vscode-widget-border)',
                paddingBottom: '0.75rem',
                fontWeight: 'bold'
            }}>
                {context.lessonName}
            </h1>
            <LessonContent sections={context.sections} vscode={vscode} />
        </div>
    );
};

// Mount the app
const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
}
