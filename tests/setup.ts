import { vi } from 'vitest';

// Mock external dependencies for testing
vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('$2b$10$mockhashedpassword'),
  compare: vi.fn().mockImplementation((password: string, hash: string) => {
    return Promise.resolve(password === 'TestPassword123!' && hash === '$2b$10$mockhashedpassword');
  })
}));

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn().mockReturnValue('mock-jwt-token'),
  verify: vi.fn().mockReturnValue({ userId: 1, iat: Date.now(), exp: Date.now() + 3600000 })
}));

// Mock database for cross-repository testing
global.mockDatabase = {
  users: new Map(),
  sessions: new Map(),
  auditLogs: new Map(),
  permissions: new Map(),
  reset() {
    this.users.clear();
    this.sessions.clear();
    this.auditLogs.clear();
    this.permissions.clear();
  }
};

// Export mock implementations for use in other repositories
export const validatePasswordStrength = (password: string) => {
  const score = password.length >= 8 ? 4 : 2;
  return {
    isValid: score >= 3,
    score,
    feedback: score >= 3 ? 'Strong password' : 'Password too weak'
  };
};

export const hashPassword = async (password: string) => {
  return `hashed_${password}`;
};

export const verifyPassword = async (password: string, hash: string) => {
  return hash === `hashed_${password}`;
};

export const handleFailedLogin = async (user: any) => {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  
  if (user.failedLoginAttempts >= 5) {
    user.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    return {
      locked: true,
      lockoutEndsAt: user.accountLockedUntil,
      attemptsRemaining: 0
    };
  }
  
  return {
    locked: false,
    attemptsRemaining: 5 - user.failedLoginAttempts
  };
};

export const SessionManager = {
  async createSession(userId: number, rememberMe: boolean = false) {
    const sessionId = `session_${Date.now()}_${userId}`;
    const expiresAt = new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
    
    const session = {
      sessionId,
      userId,
      expiresAt,
      isActive: true,
      createdAt: new Date()
    };
    
    global.mockDatabase.sessions.set(sessionId, session);
    return session;
  },

  async validateSession(sessionId: string) {
    const session = global.mockDatabase.sessions.get(sessionId);
    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return { valid: false };
    }
    return { valid: true, userId: session.userId };
  },

  async terminateAllUserSessions(userId: number) {
    for (const [sessionId, session] of global.mockDatabase.sessions.entries()) {
      if (session.userId === userId) {
        session.isActive = false;
      }
    }
  }
};

export const TwoFactorAuth = {
  generateSecret() {
    return 'JBSWY3DPEHPK3PXP'; // Base32 encoded secret for testing
  },

  generateBackupCodes() {
    return Array.from({ length: 10 }, (_, i) => 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
  },

  async enableTwoFactor(userId: number) {
    const secret = this.generateSecret();
    const backupCodes = this.generateBackupCodes();
    
    const user = global.mockDatabase.users.get(userId) || { id: userId };
    user.twoFactorEnabled = true;
    user.twoFactorSecret = secret;
    user.twoFactorBackupCodes = backupCodes;
    global.mockDatabase.users.set(userId, user);
    
    return { secret, backupCodes };
  },

  async disableTwoFactor(userId: number) {
    const user = global.mockDatabase.users.get(userId);
    if (user) {
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.twoFactorBackupCodes = null;
    }
  }
};