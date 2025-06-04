#!/bin/bash

# Enhanced Authentication Package Setup Script
# Automated deployment for Replit repositories

set -e

echo "🔐 Setting up Enhanced Authentication Package..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please run from project root."
    exit 1
fi

# Check for required files
echo "📋 Checking package integrity..."
required_files=(
    "server/security.ts"
    "server/dbStorage.ts" 
    "shared/schema.ts"
    "README.md"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
done

echo "✅ Package integrity verified"

# Install dependencies
echo "📦 Installing authentication dependencies..."
npm install bcrypt drizzle-orm drizzle-zod @neondatabase/serverless
npm install -D @types/bcrypt

# Check for database URL
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  Warning: DATABASE_URL not found in environment"
    echo "Please set your database URL before running the application"
fi

# Check for session secret
if [ -z "$SESSION_SECRET" ]; then
    echo "⚠️  Warning: SESSION_SECRET not found in environment"
    echo "Please set a secure session secret before running the application"
fi

# Create database migration
echo "🗄️  Pushing database schema..."
if command -v npm run db:push &> /dev/null; then
    npm run db:push
else
    echo "⚠️  Database migration skipped - no db:push script found"
    echo "Please run 'npm run db:push' manually after setup"
fi

# Create basic auth routes if they don't exist
echo "🛣️  Setting up authentication routes..."
if [ ! -f "server/auth.ts" ]; then
    cat > server/auth.ts << 'EOF'
import express from 'express';
import { storage } from './dbStorage';
import { 
    validatePasswordStrength, 
    hashPassword, 
    verifyPassword,
    handleFailedLogin,
    handleSuccessfulLogin,
    SessionManager,
    logAuditEvent
} from './security';

const router = express.Router();

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        
        const user = await storage.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check account lockout
        if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
            return res.status(423).json({ 
                message: 'Account locked',
                lockoutEndsAt: user.accountLockedUntil
            });
        }

        const isValid = await verifyPassword(password, user.hashedPassword);
        
        if (!isValid) {
            const result = await handleFailedLogin(user);
            await logAuditEvent(user.id, 'LOGIN_FAILED', 'user', user.id.toString(), null, null, req);
            
            return res.status(401).json({
                message: 'Invalid credentials',
                attemptsRemaining: result.attemptsRemaining
            });
        }

        await handleSuccessfulLogin(user);
        const { sessionId, expiresAt } = await SessionManager.createSession(user.id, rememberMe, req);
        
        await logAuditEvent(user.id, 'LOGIN_SUCCESS', 'user', user.id.toString(), null, { sessionId }, req);

        res.json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role
            },
            sessionId,
            expiresAt
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] as string;
        if (sessionId) {
            await SessionManager.terminateSession(sessionId, undefined, req);
        }
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
EOF
    echo "✅ Created basic authentication routes"
fi

# Create middleware if it doesn't exist
if [ ! -f "server/authMiddleware.ts" ]; then
    cat > server/authMiddleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { SessionManager } from './security';
import { storage } from './dbStorage';

export interface AuthenticatedRequest extends Request {
    user?: any;
    sessionId?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const sessionId = req.headers['x-session-id'] as string;
        
        if (!sessionId) {
            return res.status(401).json({ message: 'No session provided' });
        }

        const validation = await SessionManager.validateSession(sessionId);
        
        if (!validation.valid) {
            return res.status(401).json({ message: 'Invalid or expired session' });
        }

        const user = await storage.getUser(validation.userId!);
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'User not found or inactive' });
        }

        req.user = user;
        req.sessionId = sessionId;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ message: 'Authentication error' });
    }
}

export function requireRole(role: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (req.user.role !== role) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        next();
    };
}
EOF
    echo "✅ Created authentication middleware"
fi

echo ""
echo "🎉 Enhanced Authentication Package setup complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables:"
echo "   - DATABASE_URL=your_postgresql_connection_string"
echo "   - SESSION_SECRET=your_secure_session_secret"
echo ""
echo "2. Import authentication routes in your main server file:"
echo "   import authRoutes from './server/auth';"
echo "   app.use('/api/auth', authRoutes);"
echo ""
echo "3. Use authentication middleware for protected routes:"
echo "   import { requireAuth, requireRole } from './server/authMiddleware';"
echo "   app.get('/api/protected', requireAuth, handler);"
echo ""
echo "4. Run your application:"
echo "   npm run dev"
echo ""
echo "📚 See README.md for detailed usage instructions"