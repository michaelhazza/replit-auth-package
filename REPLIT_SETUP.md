# Enterprise Authentication Package - Replit Setup

## Quick Setup for Replit Projects

This package provides enterprise-grade authentication for your Replit projects. Choose your preferred deployment method below.

## Method 1: Git Submodule (Recommended for Updates)

### Step A: Create GitHub Repository (One-time setup)

If you haven't already created a repository for this package:

1. **Create new GitHub repository:**
   - Go to GitHub and create repository named `replit-auth-package`
   - Make it public (or private if preferred)
   - Don't initialize with README

2. **Upload package to GitHub:**
   ```bash
   # In your current Replit project
   cd auth-package-export
   git init
   git add .
   git commit -m "Initial commit: Enterprise Authentication Package"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/replit-auth-package.git
   git push -u origin main
   ```

### Step B: Add to Any Replit Project

1. **Add as submodule to your target project:**
   ```bash
   git submodule add https://github.com/YOUR_USERNAME/replit-auth-package.git auth-system
   ```

2. **Run automated setup:**
   ```bash
   cd auth-system && node replit-setup.js
   ```

3. **Done!** Authentication system is installed and configured.

### Step C: Update Package (Future updates)

When you improve the authentication package:
```bash
# In any project using the package
git submodule update --remote auth-system
cd auth-system && node replit-setup.js
```

## Method 2: Direct Deployment

### Option 1: Automated Setup

1. **Copy the setup script to your project:**
   ```bash
   curl -o setup-auth.js https://raw.githubusercontent.com/YOUR_USERNAME/replit-auth-package/main/replit-setup.js
   ```

2. **Run the setup script:**
   ```bash
   node setup-auth.js
   ```

3. **Done!** The authentication system is now installed and configured.

### Option 2: Manual Setup (5 minutes)

#### Step 1: Add the Package Files
1. Create a new folder called `auth-system` in your project root
2. Copy all files from this `auth-package-export` folder into your `auth-system` folder

#### Step 2: Install Dependencies
Run this command in your Replit shell:
```bash
npm install bcrypt jsonwebtoken express-session connect-pg-simple passport passport-local drizzle-orm @neondatabase/serverless
```

#### Step 3: Add to Your Project
Add this line to your main server file (usually `server/index.js` or `index.js`):
```javascript
const { setupAuth } = require('./auth-system');
await setupAuth(app); // Add this after creating your Express app
```

#### Step 4: Add Environment Variables
In your Replit project, add these secrets:
- `SESSION_SECRET` - Any random string (the system will generate one if missing)
- `DATABASE_URL` - Your database connection (if using external database)

### What You Get

- **User Registration & Login** - Complete signup and signin flows
- **Session Management** - Secure session handling with database storage
- **Password Security** - Bcrypt hashing and validation
- **Profile Management** - User profile updates and email changes
- **Admin Controls** - User management and authentication oversight
- **Security Features** - Rate limiting, session validation, logout protection

### Usage in Your App

```javascript
// Protect routes
app.get('/protected', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Check if user is logged in
app.get('/api/user', (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});
```

### Frontend Integration

The package includes React components you can use:
```javascript
import { LoginForm, SignupForm, UserProfile } from './auth-system/components';

// Use in your React app
<LoginForm onSuccess={(user) => console.log('Logged in:', user)} />
```

### Support

If you run into any issues:
1. Check that all dependencies are installed
2. Verify your environment variables are set
3. Make sure your database is connected (if using external database)
4. Check the browser console for any error messages

### Advanced Configuration

The system automatically configures itself for Replit, but you can customize:

```javascript
// In your main server file
const authConfig = {
  sessionSecret: process.env.SESSION_SECRET,
  sessionTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  enableRegistration: true,
  requireEmailVerification: false
};

await setupAuth(app, authConfig);
```

That's it! Your Replit project now has enterprise-grade authentication.