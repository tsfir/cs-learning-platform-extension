# Testing Phase 1: Core Extension Setup

## Setup

1. Open this extension project in VS Code
2. Press F5 to launch the Extension Development Host
3. A new VS Code window will open with the extension loaded

## Test Checklist

### ✅ Extension Activation

- [ ] Extension activates on startup
- [ ] No error messages in the console
- [ ] Status bar shows CS Learning Platform icon (once webview is implemented)

### ✅ Authentication Commands

#### Test Sign In (Multiple Methods)

**Method 1: Choose Sign-In Method**
1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "CS Platform: Sign In"
3. Choose "Sign in with Google" or "Sign in with Email/Password"
4. Expected: Browser opens for Google OAuth or email/password prompts appear
5. Expected: "Successfully signed in!" notification
6. Expected: "Signed in as [your-email]" notification

**Method 2: Direct Google Sign-In**
1. Open Command Palette
2. Type "CS Platform: Sign In with Google"
3. Browser opens for Google OAuth
4. Sign in with your Google account
5. Expected: "Successfully signed in with Google as [your-email]!" notification

**Method 3: Email/Password Sign-In**
1. Open Command Palette
2. Type "CS Platform: Sign In"
3. Choose "Sign in with Email/Password"
4. Enter your email (from web app registration)
5. Enter your password
6. Expected: "Successfully signed in!" notification

#### Test Sign Out

1. Open Command Palette
2. Type "CS Platform: Sign Out"
3. Expected: "Signed out from CS Learning Platform" notification

### ✅ Firebase Connection

#### Test Connection Command

1. Make sure you're signed in first
2. Open Command Palette
3. Type "CS Platform: Test Connection" (custom test command)
4. Expected: "Testing Firebase connection..." notification
5. Expected: "Connected! User: [your-email]" notification

### ✅ Placeholder Commands

These commands should show "Phase X implementation" messages:

- [ ] CS Platform: Open Course
- [ ] CS Platform: Open Lesson
- [ ] CS Platform: Submit Exercise
- [ ] CS Platform: Sync Now
- [ ] CS Platform: Pause Sync
- [ ] CS Platform: Resume Sync

## Expected Bundle Size

- Extension bundle: ~1.28 MB (includes Firebase SDK)
- This is acceptable for the functionality provided

## Known Issues

- OAuth flow not implemented yet (using email/password for Phase 1)
- Webview not implemented (Phase 4)
- Workspace management not implemented (Phase 2)
- Sync functionality not implemented (Phase 3)

## Success Criteria for Phase 1

✅ Extension activates without errors
✅ Firebase SDK initializes successfully
✅ User can sign in with email/password
✅ User can sign out
✅ Extension can verify Firebase connection
✅ All commands are registered (even if placeholder)

## Next Steps (Phase 2)

- Implement workspace manager
- Git template cloning
- Course/lesson navigation
- Project structure creation

## Debugging Tips

### View Extension Logs

1. In Extension Development Host, open Developer Tools (Help > Toggle Developer Tools)
2. Go to Console tab
3. Look for messages starting with "CS Learning Platform"

### Check Firebase Connection

If sign in fails:
1. Check that Firebase config in `firebase-service.ts` matches web app
2. Verify user exists in Firebase Authentication console
3. Check browser console for detailed error messages

### Common Issues

**"Failed to initialize Firebase"**
- Check internet connection
- Verify Firebase config is correct
- Check if Firebase project is active

**"Sign in failed: auth/user-not-found"**
- User doesn't exist in Firebase
- Register through web app first

**"Sign in failed: auth/wrong-password"**
- Incorrect password
- Reset password through web app if needed
