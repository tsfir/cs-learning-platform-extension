# CS Learning Platform - VS Code Extension

Interactive computer science learning environment that integrates with your CS Learning Platform account. Write and run code locally while syncing progress with the web app.

## Features (Phase 1 - Core Setup)

- ✅ Firebase authentication integration
- ✅ Direct connection to your CS Learning Platform account
- 🚧 Course workspace management (Coming in Phase 2)
- 🚧 Bi-directional sync with web app (Coming in Phase 3)
- 🚧 Interactive lesson content viewer (Coming in Phase 4)
- 🚧 Multi-language support (Python, Java, C#, TypeScript) (Coming in Phase 5)

## Getting Started

### Prerequisites

- VS Code version 1.85.0 or higher
- Active CS Learning Platform account

### Installation

1. Install the extension from the VS Code Marketplace (coming soon)
2. Open VS Code and sign in with your CS Learning Platform credentials
3. Start learning!

## Commands

Access these commands via the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

### Authentication
- `CS Platform: Sign In` - Choose between Google or Email/Password sign-in
- `CS Platform: Sign In with Google` - Directly sign in with your Google account
- `CS Platform: Sign Out` - Sign out from your account

### Course Management (Coming Soon)
- `CS Platform: Open Course` - Open a course workspace (Phase 2)
- `CS Platform: Open Lesson` - Navigate to a specific lesson (Phase 2)
- `CS Platform: Submit Exercise` - Submit your code solution (Phase 3)
- `CS Platform: Sync Now` - Manually sync your code (Phase 3)

## Configuration

Configure the extension via VS Code settings:

- `csLearningPlatform.workspaceRoot` - Root directory for course workspaces (default: `~/cs-platform-workspace`)
- `csLearningPlatform.autoSync` - Automatically sync code changes (default: `true`)
- `csLearningPlatform.syncInterval` - Sync interval in seconds (default: `30`)

## Development Phases

- ✅ **Phase 1**: Core Extension Setup (Current)
- 🚧 **Phase 2**: Workspace Management
- 🚧 **Phase 3**: Bi-Directional Sync
- 🚧 **Phase 4**: Webview Implementation
- 🚧 **Phase 5**: Multi-Language Support
- 🚧 **Phase 6**: Polish & Testing
- 🚧 **Phase 7**: Marketplace Publishing

## Support

For issues and feature requests, please visit our [GitHub repository](https://github.com/your-org/cs-learning-platform-extension).

## Privacy

This extension connects directly to Firebase using your credentials. No data is stored or transmitted to third parties. All code execution happens locally on your machine.

## License

MIT License - See LICENSE file for details
