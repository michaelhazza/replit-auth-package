import { describe, it, expect, beforeAll } from 'vitest';
import { LoadTester } from '../performance/load-testing';
import { SecurityTester } from '../security/security-testing';

describe('Authentication Performance Tests', () => {
  let loadTester: LoadTester;
  let securityTester: SecurityTester;
  
  beforeAll(() => {
    loadTester = new LoadTester('http://localhost:5000');
    securityTester = new SecurityTester('http://localhost:5000');
  });

  it('should handle concurrent login requests efficiently', async () => {
    const result = await loadTester.runLoadTest({
      endpoint: '/api/auth/login',
      method: 'POST',
      body: { email: 'test@example.com', password: 'wrongpassword' },
      concurrency: 10,
      duration: 5 // Short test for CI
    });

    expect(result.averageResponseTime).toBeLessThan(1000); // Should respond within 1 second
    expect(result.requestsPerSecond).toBeGreaterThan(5); // Should handle at least 5 requests per second
    expect(result.errorRate).toBeLessThan(50); // Allow some failures for invalid credentials
  }, 30000);

  it('should maintain performance under session validation load', async () => {
    const result = await loadTester.runLoadTest({
      endpoint: '/api/auth/user',
      method: 'GET',
      concurrency: 20,
      duration: 5
    });

    expect(result.averageResponseTime).toBeLessThan(500); // Session validation should be fast
    expect(result.requestsPerSecond).toBeGreaterThan(10);
  }, 30000);

  it('should handle password change requests without degradation', async () => {
    const result = await loadTester.runLoadTest({
      endpoint: '/api/auth/change-password',
      method: 'POST',
      body: { currentPassword: 'old', newPassword: 'new' },
      concurrency: 5,
      duration: 5
    });

    expect(result.averageResponseTime).toBeLessThan(2000); // Password hashing takes time
    expect(result.requestsPerSecond).toBeGreaterThan(2);
  }, 30000);

  it('should implement proper rate limiting for brute force protection', async () => {
    const result = await securityTester.testBruteForce();
    
    expect(result.passed).toBe(true);
    expect(result.details?.attempts).toBeLessThan(10); // Should be rate limited before 10 attempts
  }, 30000);

  it('should enforce password policy security', async () => {
    const result = await securityTester.testPasswordPolicy();
    
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('low');
  }, 15000);

  it('should protect against SQL injection attacks', async () => {
    const result = await securityTester.testSqlInjection();
    
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('low');
  }, 15000);

  it('should implement proper authorization controls', async () => {
    const result = await securityTester.testAuthorization();
    
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('low');
  }, 15000);

  it('should generate comprehensive performance report', async () => {
    const authResults = await loadTester.testAuthenticationEndpoints();
    const report = loadTester.generateReport(authResults);
    
    expect(report).toContain('Load Test Report');
    expect(report).toContain('Total Requests');
    expect(report).toContain('Avg Response Time');
    expect(Object.keys(authResults)).toHaveLength.greaterThan(0);
  }, 60000);

  it('should generate comprehensive security report', async () => {
    const securityResults = await securityTester.runAllSecurityTests();
    const report = securityTester.generateSecurityReport(securityResults);
    
    expect(report).toContain('Security Test Report');
    expect(Object.keys(securityResults)).toHaveLength(8); // 8 security tests
    
    // Check that critical security tests are included
    expect(securityResults).toHaveProperty('sql_injection_test');
    expect(securityResults).toHaveProperty('brute_force_test');
    expect(securityResults).toHaveProperty('authorization_test');
  }, 90000);
});