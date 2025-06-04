interface SecurityTest {
  name: string;
  description: string;
  test: () => Promise<SecurityTestResult>;
}

interface SecurityTestResult {
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: any;
}

export class SecurityTester {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  async runAllSecurityTests(): Promise<Record<string, SecurityTestResult>> {
    const tests: SecurityTest[] = [
      {
        name: 'sql_injection_test',
        description: 'Test for SQL injection vulnerabilities',
        test: () => this.testSqlInjection()
      },
      {
        name: 'brute_force_test',
        description: 'Test rate limiting against brute force attacks',
        test: () => this.testBruteForce()
      },
      {
        name: 'password_policy_test',
        description: 'Test password strength enforcement',
        test: () => this.testPasswordPolicy()
      },
      {
        name: 'authorization_test',
        description: 'Test authorization controls',
        test: () => this.testAuthorization()
      }
    ];

    const results: Record<string, SecurityTestResult> = {};
    
    for (const test of tests) {
      try {
        results[test.name] = await test.test();
      } catch (error: any) {
        results[test.name] = {
          passed: false,
          severity: 'high',
          message: `Test failed with error: ${error.message}`,
          details: { error: error.message }
        };
      }
    }
    
    return results;
  }

  async testSqlInjection(): Promise<SecurityTestResult> {
    const maliciousPayloads = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "admin'--"
    ];
    
    for (const payload of maliciousPayloads) {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: payload,
          password: 'password'
        })
      });
      
      const responseText = await response.text();
      
      if (responseText.includes('SQL') || 
          responseText.includes('syntax error') ||
          responseText.includes('database error') ||
          response.status === 500) {
        return {
          passed: false,
          severity: 'critical',
          message: 'Potential SQL injection vulnerability detected',
          details: { payload, response: responseText }
        };
      }
    }
    
    return {
      passed: true,
      severity: 'low',
      message: 'No SQL injection vulnerabilities detected'
    };
  }

  async testBruteForce(): Promise<SecurityTestResult> {
    let attemptCount = 0;
    let rateLimitDetected = false;
    
    while (attemptCount < 10 && !rateLimitDetected) {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
      });
      
      if (response.status === 429) {
        rateLimitDetected = true;
        break;
      }
      
      attemptCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!rateLimitDetected) {
      return {
        passed: false,
        severity: 'high',
        message: 'Rate limiting not detected - vulnerable to brute force attacks',
        details: { attempts: attemptCount }
      };
    }
    
    return {
      passed: true,
      severity: 'low',
      message: `Rate limiting detected after ${attemptCount} attempts`,
      details: { attempts: attemptCount }
    };
  }

  async testPasswordPolicy(): Promise<SecurityTestResult> {
    const weakPasswords = [
      'password',
      '123456',
      'abc123'
    ];
    
    for (const weakPassword of weakPasswords) {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test${Date.now()}@example.com`,
          firstName: 'Test',
          lastName: 'User',
          password: weakPassword
        })
      });
      
      if (response.ok) {
        return {
          passed: false,
          severity: 'medium',
          message: 'Weak password policy - allows insecure passwords',
          details: { weakPassword }
        };
      }
    }
    
    return {
      passed: true,
      severity: 'low',
      message: 'Password policy appears to enforce strong passwords'
    };
  }

  async testAuthorization(): Promise<SecurityTestResult> {
    const adminEndpoints = [
      '/api/admin/users',
      '/api/admin/audit-logs'
    ];
    
    for (const endpoint of adminEndpoints) {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET'
      });
      
      if (response.status === 200) {
        return {
          passed: false,
          severity: 'critical',
          message: 'Authorization bypass detected - admin endpoints accessible without authentication',
          details: { endpoint }
        };
      }
    }
    
    return {
      passed: true,
      severity: 'low',
      message: 'Authorization controls appear to be working'
    };
  }

  generateSecurityReport(results: Record<string, SecurityTestResult>): string {
    let report = '\n=== Security Test Report ===\n\n';
    
    const criticalIssues = Object.entries(results).filter(([_, result]) => result.severity === 'critical' && !result.passed);
    const highIssues = Object.entries(results).filter(([_, result]) => result.severity === 'high' && !result.passed);
    const mediumIssues = Object.entries(results).filter(([_, result]) => result.severity === 'medium' && !result.passed);
    
    report += `Critical Issues: ${criticalIssues.length}\n`;
    report += `High Issues: ${highIssues.length}\n`;
    report += `Medium Issues: ${mediumIssues.length}\n\n`;
    
    if (criticalIssues.length > 0) {
      report += 'CRITICAL ISSUES:\n';
      criticalIssues.forEach(([name, result]) => {
        report += `  - ${name}: ${result.message}\n`;
      });
      report += '\n';
    }
    
    if (highIssues.length > 0) {
      report += 'HIGH ISSUES:\n';
      highIssues.forEach(([name, result]) => {
        report += `  - ${name}: ${result.message}\n`;
      });
      report += '\n';
    }
    
    const passedTests = Object.entries(results).filter(([_, result]) => result.passed);
    if (passedTests.length > 0) {
      report += 'PASSED TESTS:\n';
      passedTests.forEach(([name, result]) => {
        report += `  - ${name}: ${result.message}\n`;
      });
    }
    
    return report;
  }
}