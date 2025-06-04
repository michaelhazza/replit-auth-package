# Enterprise Authentication Package - Deployment Guide

Complete instructions for integrating the Enterprise Authentication Package into any git repository via git submodules.

## Quick Start

```bash
# 1. Add the authentication package as a submodule
git submodule add <auth-package-repository-url> auth-package

# 2. Initialize and update the submodule
git submodule update --init --recursive

# 3. Run the automated setup
cd auth-package
npm run setup

# 4. Configure your environment
cp .env.example .env
# Edit .env with your database credentials

# 5. Run database migrations
npm run db:migrate

# 6. Start using the authentication system
npm test
```

## Detailed Installation Steps

### Step 1: Add Authentication Package as Git Submodule

```bash
# Navigate to your target repository
cd your-project-directory

# Add the authentication package as a submodule
git submodule add https://github.com/your-org/enterprise-auth-package.git auth-package

# Commit the submodule addition
git add .gitmodules auth-package
git commit -m "Add enterprise authentication package as submodule"
```

### Step 2: Initialize the Package

```bash
# Enter the auth package directory
cd auth-package

# Install dependencies and run setup
npm install
npm run setup
```

The setup script will automatically:
- Install required dependencies in your main project
- Create necessary database tables
- Set up security middleware
- Configure authentication routes
- Initialize test infrastructure

### Step 3: Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit the environment file with your settings
nano .env
```

Required environment variables:
```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/your_database
PGHOST=localhost
PGPORT=5432
PGUSER=your_username
PGPASSWORD=your_password
PGDATABASE=your_database

# Security Configuration
SESSION_SECRET=your-super-secure-session-secret-here
JWT_SECRET=your-jwt-secret-for-tokens

# Email Configuration (for password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_ATTEMPTS=5

# Security Headers
CORS_ORIGIN=http://localhost:3000
```

### Step 4: Database Setup

```bash
# Run database migrations to create auth tables
npm run db:migrate

# Seed with initial admin user (optional)
npm run db:seed
```

This creates the following tables:
- `users` - User accounts and profiles
- `user_sessions` - Active user sessions
- `password_reset_tokens` - Password reset functionality
- `two_factor_auth` - 2FA configuration
- `audit_logs` - Security audit trail
- `rate_limits` - Rate limiting tracking

### Step 5: Integrate with Your Application

#### Backend Integration (Express.js)

```javascript
// server/index.js
import express from 'express';
import { setupAuth, authMiddleware, adminMiddleware } from './auth-package/server/middleware.js';
import { authRoutes } from './auth-package/server/routes.js';

const app = express();

// Setup authentication middleware (must be early in middleware chain)
await setupAuth(app);

// Mount authentication routes
app.use('/api/auth', authRoutes);

// Protect your existing routes
app.get('/api/protected', authMiddleware, (req, res) => {
  res.json({ message: 'This route requires authentication' });
});

// Admin-only routes
app.get('/api/admin', adminMiddleware, (req, res) => {
  res.json({ message: 'Admin access required' });
});

app.listen(3000);
```

#### Frontend Integration (React)

```tsx
// App.tsx
import { AuthProvider, useAuth } from './auth-package/client/context/AuthContext';
import { LoginForm, RegisterForm } from './auth-package/client/components';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/dashboard" element={<ProtectedDashboard />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

function ProtectedDashboard() {
  const { user, logout } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return (
    <div>
      <h1>Welcome, {user.email}</h1>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Step 6: Configure Authentication Features

#### Enable Two-Factor Authentication

```javascript
// In your user settings component
import { setupTwoFactor, verifyTwoFactor } from './auth-package/client/services/auth';

// Enable 2FA for user
const qrCode = await setupTwoFactor();
// Display QR code to user

// Verify 2FA setup
await verifyTwoFactor(userEnteredCode);
```

#### Password Reset Flow

```javascript
// Request password reset
import { requestPasswordReset, resetPassword } from './auth-package/client/services/auth';

// Send reset email
await requestPasswordReset('user@example.com');

// Reset password with token
await resetPassword(token, newPassword);
```

#### User Management (Admin)

```tsx
import { UserManagement } from './auth-package/client/components/admin';

function AdminPanel() {
  return (
    <div>
      <h1>User Management</h1>
      <UserManagement />
    </div>
  );
}
```

### Step 7: Testing and Validation

```bash
# Run authentication tests
npm run test:auth

# Run security tests
npm run test:security

# Run performance tests
npm run test:performance

# Run full test suite
npm test
```

### Step 8: Production Deployment

#### Security Checklist

```bash
# Run security audit
npm run security:audit

# Check for vulnerabilities
npm run security:scan

# Validate deployment readiness
npm run deploy:validate
```

#### Environment Configuration

```bash
# Production environment variables
NODE_ENV=production
DATABASE_URL=your-production-database-url
SESSION_SECRET=production-session-secret
CORS_ORIGIN=https://your-production-domain.com

# Enable security features
SECURE_COOKIES=true
FORCE_HTTPS=true
ENABLE_RATE_LIMITING=true
```

## Advanced Configuration

### Custom Authentication Providers

```javascript
// Add custom OAuth provider
import { addAuthProvider } from './auth-package/server/providers';

addAuthProvider('google', {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
});
```

### Custom Middleware

```javascript
// Add custom authentication middleware
import { createAuthMiddleware } from './auth-package/server/middleware';

const customAuth = createAuthMiddleware({
  requireRole: 'premium_user',
  requireTwoFactor: true,
  allowGuests: false
});

app.get('/api/premium', customAuth, handler);
```

### Database Customization

```javascript
// Extend user model with custom fields
import { extendUserModel } from './auth-package/server/models';

extendUserModel({
  companyId: 'integer',
  preferences: 'jsonb',
  lastLoginIp: 'varchar(45)'
});
```

## API Reference

### Authentication Endpoints

```
POST /api/auth/register          # User registration
POST /api/auth/login             # User login
POST /api/auth/logout            # User logout
GET  /api/auth/me                # Get current user
PUT  /api/auth/profile           # Update user profile
POST /api/auth/change-password   # Change password
POST /api/auth/forgot-password   # Request password reset
POST /api/auth/reset-password    # Reset password with token
POST /api/auth/setup-2fa         # Setup two-factor auth
POST /api/auth/verify-2fa        # Verify 2FA code
POST /api/auth/disable-2fa       # Disable 2FA
```

### Admin Endpoints

```
GET  /api/auth/admin/users       # List all users
GET  /api/auth/admin/users/:id   # Get user by ID
PUT  /api/auth/admin/users/:id   # Update user
DELETE /api/auth/admin/users/:id # Delete user
POST /api/auth/admin/bulk        # Bulk operations
GET  /api/auth/admin/audit       # Audit logs
GET  /api/auth/admin/stats       # User statistics
```

## Updating the Package

```bash
# Update to latest version
cd auth-package
git pull origin main

# Run migration for any new changes
npm run db:migrate

# Update dependencies
npm install

# Run tests to verify compatibility
npm test
```

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Test database connectivity
npm run db:test

# Reset database (development only)
npm run db:reset
```

**Session Issues**
```bash
# Clear all sessions
npm run sessions:clear

# Debug session storage
npm run sessions:debug
```

**Permission Errors**
```bash
# Reset admin permissions
npm run admin:reset

# Check user roles
npm run roles:check
```

**Performance Issues**
```bash
# Run performance diagnostics
npm run perf:analyze

# Optimize database queries
npm run db:optimize
```

### Getting Help

1. Check the troubleshooting section above
2. Review test output for specific error messages
3. Check authentication logs in your application
4. Verify environment variables are set correctly
5. Ensure database migrations have run successfully

### Migration from Existing Auth

If you have an existing authentication system:

```bash
# Generate migration script
npm run migrate:generate

# Review and customize migration
# Edit migrations/migrate-from-existing.sql

# Run migration
npm run migrate:existing
```

## Security Best Practices

1. **Environment Variables**: Never commit secrets to git
2. **Database**: Use strong passwords and enable SSL
3. **Sessions**: Set secure session configuration
4. **Rate Limiting**: Enable for production environments
5. **HTTPS**: Always use HTTPS in production
6. **Updates**: Keep the auth package updated
7. **Monitoring**: Monitor authentication logs
8. **Backup**: Regular database backups

## License

This authentication package is licensed under MIT License. See LICENSE file for details.

## Support

For technical support and questions:
- Review the documentation above
- Check existing issues in the repository
- Create a new issue with detailed information
- Include logs and error messages when reporting problems

---

**Version**: 1.0.0  
**Last Updated**: June 2025  
**Compatibility**: Node.js 16+, PostgreSQL 12+, React 17+