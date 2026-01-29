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

    React.useEffect(() => {
        // Handle messages from the extension
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'updateContext') {
                setContext(message.payload);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    if (!context) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                <h3>Select a lesson to view content</h3>
            </div>
        );
    }

    return (
        <div className="p-4">
            <h1 style={{ marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
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
