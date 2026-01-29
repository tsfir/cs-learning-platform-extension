# Google Authentication Guide

## Overview

The CS Learning Platform extension now supports Google OAuth authentication, allowing you to sign in with the same Google account you use on the web application.

## How It Works

### Important Note: Current Limitation

**VS Code extensions cannot directly use Google OAuth popup authentication** because they run in a Node.js environment, not a browser.

**Current Workaround** (Phase 1):
1. Sign in with Google on the web application
2. Set up email/password in the web app's Settings page
3. Use email/password to sign in to the VS Code extension

**Future Enhancement** (Phase 7):
We will implement a custom VS Code authentication provider that enables true Google OAuth in the extension.

### Current Google Sign-In Flow

When you click "CS Platform: Sign In with Google":

1. Extension shows options: "Open Web App" or "Use Email/Password Instead"
2. If you choose "Open Web App":
   - Browser opens to the web application login page
   - Sign in with Google there
   - Set up email/password in Settings (one-time)
   - Return to VS Code and use email/password
3. If you choose "Use Email/Password":
   - Falls back to traditional email/password authentication

### Sign-In Methods

#### Method 1: Choose Sign-In Method (Recommended)

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "CS Platform: Sign In"
3. Choose from:
   - **Sign in with Google** - Opens browser for Google OAuth
   - **Sign in with Email/Password** - Traditional email/password login

#### Method 2: Direct Google Sign-In

1. Open Command Palette
2. Type "CS Platform: Sign In with Google"
3. Browser opens automatically
4. Complete Google OAuth flow

## Browser Popup Handling

### Important Notes

- The extension will open your default browser for Google authentication
- You must allow popups from `easycslearning-web-app.firebaseapp.com`
- The browser window will automatically close after successful authentication
- If you close the popup manually, you'll see "Sign in cancelled" message

### Troubleshooting Popup Issues

**Problem**: "auth/popup-closed-by-user" error
- **Solution**: Don't close the browser window during sign-in. Wait for it to complete.

**Problem**: Popup doesn't open
- **Solution**: Check if your browser is blocking popups. Allow popups for Firebase domains.

**Problem**: Stuck on loading screen
- **Solution**: Clear browser cache and cookies, then try again.

## Security & Privacy

### What Data is Accessed

When you sign in with Google, the extension requests:
- Email address
- Display name (if available)
- Profile picture URL (stored in Firebase, not in extension)

### Data Storage

- Authentication tokens are managed by Firebase SDK
- User ID and email are stored in VS Code workspace state
- No passwords are stored locally
- Sessions persist across VS Code restarts

### Permissions

The extension only requests the minimum permissions needed:
- Basic profile information (email, name)
- Firebase authentication scope

## Comparison: Google vs Email/Password

| Feature | Google Sign-In | Email/Password |
|---------|----------------|----------------|
| Speed | Fast (one-click) | Slower (type credentials) |
| Security | Very secure (Google OAuth) | Secure (Firebase Auth) |
| Convenience | High (no password to remember) | Medium (must remember password) |
| Browser Required | Yes (for OAuth) | No |
| Offline Support | No (initial sign-in) | No (initial sign-in) |
| Session Persistence | Yes | Yes |

## Technical Details

### Firebase Authentication Flow

```typescript
// Simplified authentication code
const provider = new GoogleAuthProvider();
const result = await signInWithPopup(auth, provider);

// Result contains:
// - user.email
// - user.uid
// - user.displayName
// - user.photoURL
// - credential (Google OAuth credential)
```

### Error Handling

The extension handles these authentication errors:

- `auth/popup-closed-by-user` - User closed popup manually
- `auth/popup-blocked` - Browser blocked the popup
- `auth/cancelled-popup-request` - Multiple popups opened simultaneously
- `auth/network-request-failed` - Network connection issue
- `auth/unauthorized-domain` - Domain not authorized in Firebase console

## Account Syncing

### Same Account Across Platforms

Your Google account is automatically synced between:
- CS Learning Platform web application
- VS Code extension
- All devices where you're signed in

### What Syncs

- User profile (email, name)
- Course progress
- Code submissions
- Completed lessons
- AI chat history (if enabled)

### What Doesn't Sync (Yet)

- Local workspace files (Phase 3 - Bi-directional sync)
- Extension settings
- VS Code preferences

## Best Practices

1. **Use the same sign-in method** on both web and extension for consistency
2. **Allow browser popups** from Firebase domains
3. **Don't close the browser** during authentication
4. **Sign out when using shared computers** to protect your account
5. **Keep your browser updated** for best security

## Limitations

### Current Limitations (Phase 1)

- Browser popup required for Google sign-in
- No offline sign-in for first-time authentication
- Single sign-on across multiple VS Code windows (same session)

### Future Enhancements (Later Phases)

- Custom authentication provider (no browser popup)
- Biometric authentication support
- Remember device option
- Multi-factor authentication (MFA)

## FAQ

**Q: Can I use different accounts on web and extension?**
A: Yes, but your progress won't sync between accounts.

**Q: What happens if I'm already signed in on the web?**
A: You'll need to sign in separately on the extension. Sessions are independent.

**Q: Can I switch between Google and Email/Password?**
A: Yes, sign out and choose a different method. Both methods access the same Firebase account.

**Q: Is my Google password stored in the extension?**
A: No. Google OAuth never exposes your password to the extension.

**Q: What if I don't have a Google account?**
A: Use "Sign in with Email/Password" instead. You can create an account on the web application first.

**Q: Can I use my work/school Google account?**
A: Yes, as long as your organization allows third-party apps.

## Support

If you encounter issues with Google authentication:

1. Check that you're using the same email on web and extension
2. Verify your browser allows popups
3. Clear browser cache and try again
4. Try "Sign in with Email/Password" as alternative
5. Report issues on GitHub with error messages

---

**Last Updated**: January 28, 2026
**Authentication Method**: Firebase Google OAuth (signInWithPopup)
**Supported Browsers**: Chrome, Edge, Firefox, Safari
