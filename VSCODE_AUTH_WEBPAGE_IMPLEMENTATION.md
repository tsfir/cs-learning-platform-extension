# VS Code Authentication Webpage Implementation

## Overview

To enable Google Sign-In in the VS Code extension, you need to create a special authentication page in your web app that handles the OAuth flow and redirects back to VS Code with a Firebase token.

## Required Web App Changes

### 1. Create VS Code Auth Page

**File**: `src/pages/VSCodeAuth.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const VSCodeAuth = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const state = searchParams.get('state');
  const redirectUri = searchParams.get('redirect_uri');

  useEffect(() => {
    handleGoogleSignIn();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      // Sign in with Google
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      // Get the ID token (this is what VS Code needs)
      const idToken = await result.user.getIdToken();

      // Redirect back to VS Code with the token
      if (redirectUri && state) {
        const callbackUrl = `${redirectUri}?token=${idToken}&state=${state}`;
        window.location.href = callbackUrl;
      } else {
        setStatus('error');
        setErrorMessage('Missing redirect_uri or state parameter');
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      setStatus('error');
      setErrorMessage(error.message || 'Authentication failed');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {status === 'loading' && (
        <>
          <h2>Authenticating with Google...</h2>
          <p>Please wait while we sign you in.</p>
          <div className="spinner" style={{
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite'
          }} />
        </>
      )}

      {status === 'success' && (
        <>
          <h2>✓ Authentication Successful!</h2>
          <p>Redirecting back to VS Code...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <h2>✗ Authentication Failed</h2>
          <p style={{ color: 'red' }}>{errorMessage}</p>
          <button onClick={handleGoogleSignIn}>Try Again</button>
        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default VSCodeAuth;
```

### 2. Add Route to App.tsx

```typescript
import VSCodeAuth from './pages/VSCodeAuth';

// In your Routes:
<Route path="/vscode-auth" element={<VSCodeAuth />} />
```

### 3. Update Firebase Hosting Configuration

**File**: `firebase.json` (or hosting config)

Add the VS Code redirect URI to allowed domains:

```json
{
  "hosting": {
    "rewrites": [
      {
        "source": "/vscode-auth",
        "destination": "/index.html"
      }
    ]
  }
}
```

### 4. Configure Firebase Console

1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Add `vscode://` to authorized redirect URIs (if not already there)
3. This allows VS Code to receive the OAuth callback

## How It Works

### Flow Diagram

```
1. User clicks "Sign in with Google" in VS Code
   ↓
2. VS Code opens browser to:
   https://your-app.firebaseapp.com/vscode-auth?state=xyz&redirect_uri=vscode://...
   ↓
3. Web page automatically triggers Google Sign-In popup
   ↓
4. User authenticates with Google
   ↓
5. Firebase returns ID token
   ↓
6. Web page redirects to:
   vscode://cs-learning-platform.cs-learning-platform/auth-callback?token=...&state=xyz
   ↓
7. VS Code receives the callback and token
   ↓
8. VS Code signs in to Firebase with the token
   ↓
9. User is authenticated! ✓
```

### URL Parameters

**Incoming (from VS Code)**:
- `state`: Random UUID for security (prevents CSRF)
- `redirect_uri`: The VS Code URI to redirect back to

**Outgoing (to VS Code)**:
- `token`: Firebase ID token
- `state`: Same UUID (VS Code validates this matches)

## Security Considerations

### 1. State Parameter Validation

The `state` parameter is critical for security:
- VS Code generates a random UUID
- Sends it to the web app
- Web app returns it unchanged
- VS Code validates it matches
- Prevents CSRF attacks

### 2. HTTPS Only

- All communication must be over HTTPS
- Firebase enforces this
- VS Code enforces this

### 3. Token Expiry

- ID tokens expire after 1 hour
- Firebase SDK automatically refreshes
- VS Code extension stores the token securely

### 4. Redirect URI Validation

- Only allow `vscode://` scheme
- Validate the redirect URI matches expected pattern
- Don't redirect to arbitrary URLs

## Testing

### 1. Test in Development

```bash
# Start web app dev server
npm run dev

# Open VS Code extension
# Click "Sign in with Google"
# Should open: http://localhost:5173/vscode-auth?state=...&redirect_uri=vscode://...
```

### 2. Test in Production

```bash
# Deploy web app
firebase deploy --only hosting

# Test with extension
# Should open: https://your-app.firebaseapp.com/vscode-auth?...
```

### 3. Verify Token

After successful auth, check VS Code console:
```typescript
// In extension, after receiving token
const userInfo = await this.getUserInfo(token);
console.log('Authenticated user:', userInfo);
```

## Troubleshooting

### Issue: "Popup blocked"

**Solution**: User needs to allow popups for your domain

### Issue: "Unauthorized domain"

**Solution**: Add domain to Firebase Console → Authentication → Authorized domains

### Issue: "Invalid redirect_uri"

**Solution**: Check that `vscode://` scheme is allowed in Firebase

### Issue: VS Code doesn't receive callback

**Solution**:
1. Check browser console for errors
2. Verify redirect URL is correctly formatted
3. Test the redirect URL manually

### Issue: Token verification fails

**Solution**:
1. Ensure token is a valid Firebase ID token (not access token)
2. Use `getIdToken()` not `getAccessToken()`
3. Check Firebase API key in extension matches web app

## Alternative: Cloud Function Approach

If you prefer not to handle auth in the web app frontend, you can create a Cloud Function:

```typescript
// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const vsCodeAuth = functions.https.onRequest(async (req, res) => {
  const { state, redirect_uri } = req.query;

  // Show Google sign-in page
  // Handle callback
  // Generate custom token
  // Redirect to VS Code

  const customToken = await admin.auth().createCustomToken(uid);
  res.redirect(`${redirect_uri}?token=${customToken}&state=${state}`);
});
```

## Summary

1. ✅ Create `/vscode-auth` page in web app
2. ✅ Handle Google OAuth in the page
3. ✅ Get Firebase ID token
4. ✅ Redirect back to VS Code with token
5. ✅ VS Code receives and validates token
6. ✅ User is authenticated!

**Estimated Implementation Time**: 30-60 minutes

**Files to Create/Modify**:
- `src/pages/VSCodeAuth.tsx` (new)
- `src/App.tsx` (add route)
- `firebase.json` (if needed)

---

**Status**: Ready to implement in web app
**Dependencies**: None (uses existing Firebase auth)
**Testing**: Can be tested locally before deployment
