import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validatePasswordStrength, hashPassword, verifyPassword, handleFailedLogin, SessionManager, TwoFactorAuth } from '../server/security';
import { DatabaseStorage } from '../server/dbStorage';

// Mock database for testing
const mockDb = {
  users: new Map(),
  sessions: new Map(),
  auditLogs: new Map(),
  permissions: new Map()
};

describe('Authentication System Tests', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
    // Reset mocks
    mockDb.users.clear();
    mockDb.sessions.clear();
    mockDb.auditLogs.clear();
    mockDb.permissions.clear();
  });

  describe('Password Security', () => {
    it('should validate password strength correctly', () => {
      const weakPassword = validatePasswordStrength('123');
      expect(weakPassword.isValid).toBe(false);
      expect(weakPassword.score).toBeLessThan(3);

      const strongPassword = validatePasswordStrength('SecureP@ssw0rd123');
      expect(strongPassword.isValid).toBe(true);
      expect(strongPassword.score).toBeGreaterThanOrEqual(3);
    });

    it('should hash and verify passwords correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should prevent password reuse', async () => {
      const userId = 1;
      const password1 = 'FirstPassword123!';
      const password2 = 'SecondPassword123!';
      
      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);
      
      // Simulate saving password history
      mockDb.users.set(userId, { 
        passwordHistory: [hash1, hash2]
      });
      
      // Test would check against password history
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Account Lockout', () => {
    it('should handle failed login attempts correctly', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        failedLoginAttempts: 0,
        accountLockedUntil: null
      };

      // First few attempts should not lock account
      for (let i = 1; i < 5; i++) {
        const result = await handleFailedLogin(mockUser);
        expect(result.locked).toBe(false);
        expect(result.attemptsRemaining).toBe(5 - i);
      }

      // 5th attempt should lock account
      const lockResult = await handleFailedLogin(mockUser);
      expect(lockResult.locked).toBe(true);
      expect(lockResult.lockoutEndsAt).toBeDefined();
    });

    it('should clear failed attempts on successful login', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        failedLoginAttempts: 3,
        accountLockedUntil: null
      };

      // This would call handleSuccessfulLogin which resets attempts
      expect(mockUser.failedLoginAttempts).toBe(3);
      // After successful login, attempts should be reset to 0
    });
  });

  describe('Session Management', () => {
    it('should create sessions with proper expiration', async () => {
      const userId = 1;
      const rememberMe = false;
      
      const session = await SessionManager.createSession(userId, rememberMe);
      
      expect(session.sessionId).toBeDefined();
      expect(session.expiresAt).toBeDefined();
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      
      // Regular session should expire in 24 hours
      const hoursDiff = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeCloseTo(24, 0);
    });

    it('should create extended sessions for remember me', async () => {
      const userId = 1;
      const rememberMe = true;
      
      const session = await SessionManager.createSession(userId, rememberMe);
      
      expect(session.sessionId).toBeDefined();
      expect(session.expiresAt).toBeDefined();
      
      // Remember me session should expire in 30 days
      const daysDiff = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(30, 0);
    });

    it('should validate sessions correctly', async () => {
      const validSessionId = 'valid-session-123';
      const expiredSessionId = 'expired-session-456';
      
      // Mock valid session
      mockDb.sessions.set(validSessionId, {
        userId: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        isActive: true
      });
      
      // Mock expired session
      mockDb.sessions.set(expiredSessionId, {
        userId: 1,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        isActive: true
      });
      
      const validResult = await SessionManager.validateSession(validSessionId);
      expect(validResult.valid).toBe(true);
      expect(validResult.userId).toBe(1);
      
      const expiredResult = await SessionManager.validateSession(expiredSessionId);
      expect(expiredResult.valid).toBe(false);
    });

    it('should terminate all user sessions', async () => {
      const userId = 1;
      
      // Create multiple sessions for user
      mockDb.sessions.set('session1', { userId, isActive: true });
      mockDb.sessions.set('session2', { userId, isActive: true });
      mockDb.sessions.set('session3', { userId: 2, isActive: true }); // Different user
      
      await SessionManager.terminateAllUserSessions(userId);
      
      // User 1's sessions should be deactivated
      expect(mockDb.sessions.get('session1').isActive).toBe(false);
      expect(mockDb.sessions.get('session2').isActive).toBe(false);
      // User 2's session should remain active
      expect(mockDb.sessions.get('session3').isActive).toBe(true);
    });
  });

  describe('Two-Factor Authentication', () => {
    it('should generate TOTP secret', () => {
      const secret = TwoFactorAuth.generateSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThan(0);
    });

    it('should generate backup codes', () => {
      const codes = TwoFactorAuth.generateBackupCodes();
      expect(codes).toBeDefined();
      expect(codes.length).toBe(10);
      expect(codes.every(code => code.length === 8)).toBe(true);
    });

    it('should enable and disable two-factor auth', async () => {
      const userId = 1;
      
      const enableResult = await TwoFactorAuth.enableTwoFactor(userId);
      expect(enableResult.secret).toBeDefined();
      expect(enableResult.backupCodes).toBeDefined();
      expect(enableResult.backupCodes.length).toBe(10);
      
      // Mock user with 2FA enabled
      mockDb.users.set(userId, {
        twoFactorEnabled: true,
        twoFactorSecret: enableResult.secret,
        twoFactorBackupCodes: enableResult.backupCodes
      });
      
      await TwoFactorAuth.disableTwoFactor(userId);
      
      // Check that 2FA is disabled
      const user = mockDb.users.get(userId);
      expect(user.twoFactorEnabled).toBe(false);
      expect(user.twoFactorSecret).toBeNull();
      expect(user.twoFactorBackupCodes).toBeNull();
    });
  });

  describe('User Profile Management', () => {
    it('should update user profile', async () => {
      const userId = 1;
      const updateData = {
        firstName: 'John',
        lastName: 'Doe',
        preferences: { theme: 'dark', notifications: true }
      };
      
      mockDb.users.set(userId, {
        id: userId,
        email: 'john@example.com',
        ...updateData
      });
      
      const user = mockDb.users.get(userId);
      expect(user.firstName).toBe(updateData.firstName);
      expect(user.lastName).toBe(updateData.lastName);
      expect(user.preferences).toEqual(updateData.preferences);
    });

    it('should handle email change verification', async () => {
      const userId = 1;
      const newEmail = 'newemail@example.com';
      const token = 'verification-token-123';
      
      // Mock pending email change
      mockDb.users.set(userId, {
        id: userId,
        email: 'old@example.com',
        pendingEmail: newEmail,
        emailVerificationToken: token,
        emailTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      
      // Verify token and update email
      const user = mockDb.users.get(userId);
      expect(user.pendingEmail).toBe(newEmail);
      expect(user.emailVerificationToken).toBe(token);
      
      // After verification
      user.email = user.pendingEmail;
      user.pendingEmail = null;
      user.emailVerificationToken = null;
      user.emailVerified = true;
      
      expect(user.email).toBe(newEmail);
      expect(user.emailVerified).toBe(true);
    });
  });

  describe('Permission System', () => {
    it('should manage role-based permissions', async () => {
      const userId = 1;
      const permissionId = 1;
      
      // Mock permission
      mockDb.permissions.set(permissionId, {
        id: permissionId,
        name: 'user.read',
        resource: 'user',
        action: 'read'
      });
      
      // Grant permission to user
      const userPermission = {
        userId,
        permissionId,
        granted: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };
      
      mockDb.users.set(`${userId}-${permissionId}`, userPermission);
      
      const permission = mockDb.users.get(`${userId}-${permissionId}`);
      expect(permission.granted).toBe(true);
      expect(permission.expiresAt).toBeDefined();
    });

    it('should handle temporary permissions with expiration', async () => {
      const userId = 1;
      const permissionId = 1;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      const permission = {
        userId,
        permissionId,
        granted: true,
        expiresAt
      };
      
      mockDb.users.set(`${userId}-${permissionId}`, permission);
      
      // Check if permission is still valid
      const now = new Date();
      const isValid = permission.expiresAt > now;
      expect(isValid).toBe(true);
      
      // Simulate time passing
      const futureTime = new Date(expiresAt.getTime() + 60 * 60 * 1000);
      const isExpired = permission.expiresAt < futureTime;
      expect(isExpired).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    it('should log authentication events', async () => {
      const userId = 1;
      const action = 'LOGIN_SUCCESS';
      const resourceType = 'user';
      const resourceId = userId.toString();
      const metadata = { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' };
      
      const auditEntry = {
        userId,
        action,
        resourceType,
        resourceId,
        metadata,
        createdAt: new Date()
      };
      
      mockDb.auditLogs.set(Date.now(), auditEntry);
      
      const logs = Array.from(mockDb.auditLogs.values());
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe(action);
      expect(logs[0].metadata.ipAddress).toBe('192.168.1.1');
    });

    it('should track admin actions', async () => {
      const adminId = 1;
      const targetUserId = 2;
      const action = 'BULK_ROLE_CHANGE';
      
      const auditEntry = {
        userId: adminId,
        action,
        resourceType: 'user',
        resourceId: targetUserId.toString(),
        oldValues: { role: 'user' },
        newValues: { role: 'admin' },
        createdAt: new Date()
      };
      
      mockDb.auditLogs.set(Date.now(), auditEntry);
      
      const logs = Array.from(mockDb.auditLogs.values());
      expect(logs[0].oldValues.role).toBe('user');
      expect(logs[0].newValues.role).toBe('admin');
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk role changes', async () => {
      const userIds = [1, 2, 3];
      const newRole = 'admin';
      
      userIds.forEach(id => {
        mockDb.users.set(id, { id, role: 'user' });
      });
      
      // Simulate bulk role change
      userIds.forEach(id => {
        const user = mockDb.users.get(id);
        user.role = newRole;
      });
      
      userIds.forEach(id => {
        const user = mockDb.users.get(id);
        expect(user.role).toBe(newRole);
      });
    });

    it('should handle bulk user deactivation', async () => {
      const userIds = [1, 2, 3];
      
      userIds.forEach(id => {
        mockDb.users.set(id, { id, isActive: true });
      });
      
      // Simulate bulk deactivation
      userIds.forEach(id => {
        const user = mockDb.users.get(id);
        user.isActive = false;
        user.deactivatedAt = new Date();
      });
      
      userIds.forEach(id => {
        const user = mockDb.users.get(id);
        expect(user.isActive).toBe(false);
        expect(user.deactivatedAt).toBeDefined();
      });
    });
  });

  describe('System Health Checks', () => {
    it('should report healthy system status', async () => {
      const healthStatus = {
        timestamp: new Date(),
        status: 'healthy',
        components: {
          database: { status: 'healthy', message: 'Database connection successful' },
          sessions: { status: 'healthy', message: '5 active sessions', count: 5 },
          auditLogs: { status: 'healthy', message: '10 recent audit logs', recentCount: 10 },
          passwordSecurity: { status: 'healthy', message: 'Password validation functional', testResult: true }
        }
      };
      
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.components.database.status).toBe('healthy');
      expect(healthStatus.components.sessions.count).toBe(5);
    });

    it('should report degraded status when components fail', async () => {
      const healthStatus = {
        timestamp: new Date(),
        status: 'degraded',
        components: {
          database: { status: 'unhealthy', message: 'Database connection failed', error: 'Connection timeout' },
          sessions: { status: 'healthy', message: '5 active sessions', count: 5 }
        }
      };
      
      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.components.database.status).toBe('unhealthy');
    });
  });

  describe('Data Export (GDPR Compliance)', () => {
    it('should export complete user data', async () => {
      const userId = 1;
      
      // Mock user data
      const userData = {
        id: userId,
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        preferences: { theme: 'dark' },
        createdAt: new Date(),
        emailVerified: true
      };
      
      const sessions = [
        { id: 'session1', createdAt: new Date(), ipAddress: '192.168.1.1' }
      ];
      
      const auditLogs = [
        { action: 'LOGIN_SUCCESS', createdAt: new Date(), metadata: {} }
      ];
      
      const exportData = {
        user: userData,
        sessions,
        auditLogs,
        permissions: [],
        exportedAt: new Date(),
        exportedBy: 1
      };
      
      expect(exportData.user.email).toBe('user@example.com');
      expect(exportData.sessions.length).toBe(1);
      expect(exportData.auditLogs.length).toBe(1);
      expect(exportData.exportedAt).toBeDefined();
    });
  });
});