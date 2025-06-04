# Enterprise Authentication Package

A production-ready authentication system with comprehensive security features, designed for seamless deployment across multiple Replit repositories via git submodules. Includes complete test coverage and all enterprise-grade authentication features.

## Features

### Core Authentication
- **User Registration & Login** - Complete user authentication flow
- **Password Security** - Advanced password strength validation and history tracking
- **Account Lockout** - Configurable failed login attempt protection
- **Session Management** - Enhanced session tracking with device info and concurrent session limits
- **Two-Factor Authentication** - TOTP support with backup codes

### Admin Features
- **User Management** - Admin panel for user administration
- **Permission System** - Granular role-based and user-specific permissions
- **Audit Logging** - Comprehensive security audit trail
- **Bulk Operations** - Mass user management capabilities
- **Data Export** - GDPR-compliant user data export

### Security Features
- **Password Strength Validation** - Configurable complexity requirements
- **Login Attempt Tracking** - Escalating lockout periods
- **Session Security** - Device fingerprinting and activity monitoring
- **Audit Trail** - Complete action logging with IP tracking
- **Email Verification** - Secure email change verification flow

## Installation

### Option 1: Git Submodule (Recommended)
```bash
# Add as submodule
git submodule add https://github.com/your-repo/auth-package.git auth-package

# Initialize submodule
git submodule update --init --recursive

# Run setup script
cd auth-package && ./scripts/setup.sh
```

### Option 2: Manual Installation
1. Copy all files from this package to your project
2. Install required dependencies:
   ```bash
   npm install bcrypt drizzle-orm drizzle-zod @neondatabase/serverless
   npm install -D @types/bcrypt
   ```
3. Run database migration: `npm run db:push`

## Configuration

### Database Schema
The package includes these tables:
- `users` - Enhanced user table with security fields
- `user_sessions` - Session tracking
- `audit_logs` - Security audit trail
- `permissions` - Permission definitions
- `role_permissions` - Role-based permissions
- `user_permissions` - User-specific permissions
- `password_history` - Password reuse prevention

### Environment Variables
```env
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_session_secret_key
```

### Security Configuration
Customize settings in `server/security.ts`:

```typescript
export const PASSWORD_CONFIG = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventReuse: 5, // Previous passwords to check
  maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
};

export const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  escalatingLockout: true,
};

export const SESSION_CONFIG = {
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  rememberMeTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxConcurrentSessions: 5,
  timeoutWarning: 5 * 60 * 1000, // 5 minutes
};
```

## Usage

### Basic Authentication
```typescript
import { hashPassword, verifyPassword, validatePasswordStrength } from './server/security';
import { storage } from './server/dbStorage';

// Register user
const strength = validatePasswordStrength(password);
if (!strength.isValid) {
  throw new Error(strength.feedback.join(', '));
}

const hashedPassword = await hashPassword(password);
const user = await storage.createUser({
  email,
  hashedPassword,
  firstName,
  lastName
});
```

### Session Management
```typescript
import { SessionManager } from './server/security';

// Create session
const { sessionId, expiresAt } = await SessionManager.createSession(
  userId, 
  rememberMe, 
  req
);

// Validate session
const validation = await SessionManager.validateSession(sessionId);
if (!validation.valid) {
  // Session expired or invalid
}
```

### Audit Logging
```typescript
import { logAuditEvent } from './server/security';

// Log user action
await logAuditEvent(
  userId,
  'USER_LOGIN',
  'user',
  userId.toString(),
  null,
  { loginMethod: 'password' },
  req
);
```

## API Endpoints

### Authentication Routes
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset confirmation

### User Management (Admin)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Deactivate user
- `POST /api/admin/users/bulk-update` - Bulk user operations
- `GET /api/admin/audit-logs` - View audit logs

### Session Management
- `GET /api/auth/sessions` - List user sessions
- `DELETE /api/auth/sessions/:id` - Terminate session
- `DELETE /api/auth/sessions/all` - Terminate all sessions

## Deployment Strategies

### Replit Deployment
1. Copy auth-system folder to your project or run setup script
2. Add one line to your server: `setupAuth(app)`
3. Install dependencies: `npm install bcrypt express-session`
4. Your authentication is ready to use

## License

MIT License - see LICENSE file for details.