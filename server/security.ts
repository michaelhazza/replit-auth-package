/**
 * Enhanced Security Utilities
 * Password strength, account lockout, audit logging, session management
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Request } from 'express';
import { storage } from './dbStorage';
import { User, InsertAuditLog } from '@shared/schema';

// Password strength configuration
export const PASSWORD_CONFIG = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventReuse: 5, // Number of previous passwords to check
  maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days in milliseconds
};

// Account lockout configuration
export const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  escalatingLockout: true,
};

// Session configuration
export const SESSION_CONFIG = {
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  rememberMeTtl: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxConcurrentSessions: 5,
  timeoutWarning: 5 * 60 * 1000, // 5 minutes before expiry
};

export interface PasswordStrengthResult {
  score: number; // 0-4
  feedback: string[];
  isValid: boolean;
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= PASSWORD_CONFIG.minLength) {
    score++;
  } else {
    feedback.push(`Password must be at least ${PASSWORD_CONFIG.minLength} characters long`);
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push('Password must contain at least one uppercase letter');
  }

  // Lowercase check
  if (/[a-z]/.test(password)) {
    score++;
  } else {
    feedback.push('Password must contain at least one lowercase letter');
  }

  // Number check
  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push('Password must contain at least one number');
  }

  // Special character check
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)) {
    score++;
  } else {
    feedback.push('Password must contain at least one special character');
  }

  // Common patterns check
  const commonPatterns = [
    /123456/,
    /password/i,
    /qwerty/i,
    /abc123/i,
    /admin/i,
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      feedback.push('Password contains common patterns that should be avoided');
      score = Math.max(0, score - 1);
      break;
    }
  }

  return {
    score,
    feedback,
    isValid: score >= 4 && feedback.length === 0,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12); // Increased salt rounds for better security
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function checkPasswordHistory(userId: number, newPassword: string): Promise<boolean> {
  const history = await storage.getPasswordHistory(userId, PASSWORD_CONFIG.preventReuse);
  
  for (const historyEntry of history) {
    if (await verifyPassword(newPassword, historyEntry.passwordHash)) {
      return false; // Password was used before
    }
  }
  
  return true; // Password is unique
}

export async function savePasswordToHistory(userId: number, passwordHash: string): Promise<void> {
  await storage.addPasswordHistory(userId, passwordHash);
}

export interface LoginAttemptResult {
  success: boolean;
  locked: boolean;
  lockoutEndsAt?: Date;
  attemptsRemaining?: number;
}

export async function handleFailedLogin(user: User): Promise<LoginAttemptResult> {
  const attempts = (user.failedLoginAttempts || 0) + 1;
  const now = new Date();
  
  // Check if account is currently locked
  if (user.accountLockedUntil && user.accountLockedUntil > now) {
    return {
      success: false,
      locked: true,
      lockoutEndsAt: user.accountLockedUntil,
    };
  }

  // Escalating lockout durations
  let lockoutDuration = LOCKOUT_CONFIG.lockoutDuration;
  if (LOCKOUT_CONFIG.escalatingLockout && attempts > LOCKOUT_CONFIG.maxAttempts) {
    lockoutDuration *= Math.pow(2, Math.min(attempts - LOCKOUT_CONFIG.maxAttempts, 5));
  }

  const shouldLock = attempts >= LOCKOUT_CONFIG.maxAttempts;
  const lockoutEndsAt = shouldLock ? new Date(now.getTime() + lockoutDuration) : undefined;

  await storage.updateUserLoginAttempts(user.id, attempts, lockoutEndsAt);

  return {
    success: false,
    locked: shouldLock,
    lockoutEndsAt,
    attemptsRemaining: shouldLock ? 0 : LOCKOUT_CONFIG.maxAttempts - attempts,
  };
}

export async function handleSuccessfulLogin(user: User): Promise<void> {
  await storage.resetUserLoginAttempts(user.id);
  await storage.updateUserLastLogin(user.id);
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateTokenWithExpiry(hours: number = 24): { token: string; expires: Date } {
  return {
    token: generateSecureToken(),
    expires: new Date(Date.now() + hours * 60 * 60 * 1000),
  };
}

export function extractClientInfo(req: Request): {
  ipAddress: string;
  userAgent: string;
  deviceInfo: string;
} {
  const forwardedFor = req.headers['x-forwarded-for'] as string;
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Extract basic device info from user agent
  let deviceInfo = 'unknown';
  if (userAgent !== 'unknown') {
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
    const isTablet = /Tablet|iPad/.test(userAgent);
    const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
    const browser = browserMatch ? browserMatch[1] : 'Unknown Browser';
    
    deviceInfo = `${browser} on ${isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'}`;
  }

  return { ipAddress, userAgent, deviceInfo };
}

export async function logAuditEvent(
  userId: number | null,
  action: string,
  entityType?: string,
  entityId?: string,
  oldValues?: any,
  newValues?: any,
  req?: Request
): Promise<void> {
  const clientInfo = req ? extractClientInfo(req) : { ipAddress: 'system', userAgent: 'system', deviceInfo: 'system' };
  
  const auditLog: InsertAuditLog = {
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
  };

  await storage.createAuditLog(auditLog);
}

export class SessionManager {
  static async createSession(
    userId: number,
    rememberMe: boolean = false,
    req?: Request
  ): Promise<{ sessionId: string; expiresAt: Date }> {
    const sessionId = generateSecureToken();
    const ttl = rememberMe ? SESSION_CONFIG.rememberMeTtl : SESSION_CONFIG.defaultTtl;
    const expiresAt = new Date(Date.now() + ttl);
    const clientInfo = req ? extractClientInfo(req) : { ipAddress: 'unknown', userAgent: 'unknown', deviceInfo: 'unknown' };

    // Clean up old sessions if user has too many
    await this.cleanupOldSessions(userId);

    await storage.createUserSession({
      userId,
      sessionId,
      deviceInfo: clientInfo.deviceInfo,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      rememberMe,
      expiresAt,
    });

    if (req) {
      await logAuditEvent(userId, 'SESSION_CREATED', 'session', sessionId, null, { rememberMe }, req);
    }

    return { sessionId, expiresAt };
  }

  static async validateSession(sessionId: string): Promise<{ valid: boolean; userId?: number; shouldRefresh?: boolean }> {
    const session = await storage.getUserSession(sessionId);
    
    if (!session || !session.isActive) {
      return { valid: false };
    }

    const now = new Date();
    
    // Check if session is expired
    if (session.expiresAt <= now) {
      await storage.deactivateUserSession(sessionId);
      return { valid: false };
    }

    // Check if session should be refreshed (last activity > 1 hour ago)
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const shouldRefresh = session.lastActivity < hourAgo;

    if (shouldRefresh) {
      await storage.updateSessionActivity(sessionId);
    }

    return {
      valid: true,
      userId: session.userId,
      shouldRefresh,
    };
  }

  static async refreshSession(sessionId: string, rememberMe?: boolean): Promise<Date> {
    const ttl = rememberMe ? SESSION_CONFIG.rememberMeTtl : SESSION_CONFIG.defaultTtl;
    const newExpiresAt = new Date(Date.now() + ttl);
    
    await storage.refreshUserSession(sessionId, newExpiresAt);
    return newExpiresAt;
  }

  static async terminateSession(sessionId: string, userId?: number, req?: Request): Promise<void> {
    await storage.deactivateUserSession(sessionId);
    
    if (userId && req) {
      await logAuditEvent(userId, 'SESSION_TERMINATED', 'session', sessionId, null, null, req);
    }
  }

  static async terminateAllUserSessions(userId: number, excludeSessionId?: string, req?: Request): Promise<void> {
    await storage.deactivateAllUserSessions(userId, excludeSessionId);
    
    if (req) {
      await logAuditEvent(userId, 'ALL_SESSIONS_TERMINATED', 'user', userId.toString(), null, { excludeSessionId }, req);
    }
  }

  static async cleanupOldSessions(userId: number): Promise<void> {
    const sessions = await storage.getUserActiveSessions(userId);
    
    if (sessions.length >= SESSION_CONFIG.maxConcurrentSessions) {
      // Sort by last activity and remove oldest
      sessions.sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime());
      const sessionsToRemove = sessions.slice(0, sessions.length - SESSION_CONFIG.maxConcurrentSessions + 1);
      
      for (const session of sessionsToRemove) {
        await storage.deactivateUserSession(session.sessionId);
      }
    }
  }

  static async getUserActiveSessions(userId: number): Promise<any[]> {
    return await storage.getUserActiveSessions(userId);
  }
}

// Two-Factor Authentication utilities
export class TwoFactorAuth {
  static generateSecret(): string {
    return crypto.randomBytes(20).toString('hex');
  }

  static generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  static async enableTwoFactor(userId: number): Promise<{ secret: string; backupCodes: string[] }> {
    const secret = this.generateSecret();
    const backupCodes = this.generateBackupCodes();
    
    await storage.updateUserTwoFactor(userId, secret, true);
    // Store backup codes securely (hashed)
    const hashedCodes = await Promise.all(backupCodes.map(code => hashPassword(code)));
    await storage.storeTwoFactorBackupCodes(userId, hashedCodes);
    
    return { secret, backupCodes };
  }

  static async disableTwoFactor(userId: number): Promise<void> {
    await storage.updateUserTwoFactor(userId, null, false);
    await storage.clearTwoFactorBackupCodes(userId);
  }
}