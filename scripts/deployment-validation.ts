import { LoadTester } from '../performance/load-testing';
import { SecurityTester } from '../security/security-testing';
import { db } from '../server/db';

interface DeploymentValidationResult {
  database: boolean;
  authentication: boolean;
  security: boolean;
  performance: boolean;
  errors: string[];
  warnings: string[];
}

export class DeploymentValidator {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  async validateDeployment(): Promise<DeploymentValidationResult> {
    const result: DeploymentValidationResult = {
      database: false,
      authentication: false,
      security: false,
      performance: false,
      errors: [],
      warnings: []
    };

    console.log('Starting deployment validation...');

    // Database validation
    try {
      await this.validateDatabase();
      result.database = true;
      console.log('✓ Database validation passed');
    } catch (error) {
      result.errors.push(`Database validation failed: ${error.message}`);
      console.log('✗ Database validation failed');
    }

    // Authentication validation
    try {
      await this.validateAuthentication();
      result.authentication = true;
      console.log('✓ Authentication validation passed');
    } catch (error) {
      result.errors.push(`Authentication validation failed: ${error.message}`);
      console.log('✗ Authentication validation failed');
    }

    // Security validation
    try {
      const securityResults = await this.validateSecurity();
      result.security = securityResults.passed;
      if (!securityResults.passed) {
        result.errors.push(...securityResults.errors);
      }
      if (securityResults.warnings.length > 0) {
        result.warnings.push(...securityResults.warnings);
      }
      console.log('✓ Security validation completed');
    } catch (error) {
      result.errors.push(`Security validation failed: ${error.message}`);
      console.log('✗ Security validation failed');
    }

    // Performance validation
    try {
      const performanceResults = await this.validatePerformance();
      result.performance = performanceResults.passed;
      if (!performanceResults.passed) {
        result.errors.push(...performanceResults.errors);
      }
      if (performanceResults.warnings.length > 0) {
        result.warnings.push(...performanceResults.warnings);
      }
      console.log('✓ Performance validation completed');
    } catch (error) {
      result.errors.push(`Performance validation failed: ${error.message}`);
      console.log('✗ Performance validation failed');
    }

    return result;
  }

  private async validateDatabase(): Promise<void> {
    // Check database connection
    const result = await db.execute('SELECT 1 as test');
    if (!result.rows || result.rows.length === 0) {
      throw new Error('Database connection failed');
    }

    // Check required tables exist
    const tables = ['users', 'user_sessions', 'audit_logs', 'permissions', 'role_permissions', 'user_permissions'];
    for (const table of tables) {
      const tableCheck = await db.execute(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = $1 AND table_schema = 'public'
      `, [table]);
      
      if (!tableCheck.rows || tableCheck.rows.length === 0) {
        throw new Error(`Required table '${table}' not found`);
      }
    }

    // Check if system user exists
    const systemUser = await db.execute('SELECT id FROM users WHERE email = $1', ['system@auth-package.internal']);
    if (!systemUser.rows || systemUser.rows.length === 0) {
      console.log('Warning: System user not found, creating...');
      await db.execute(`
        INSERT INTO users (id, email, first_name, last_name, is_active, created_at)
        VALUES ('system', 'system@auth-package.internal', 'System', 'User', false, NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    }
  }

  private async validateAuthentication(): Promise<void> {
    // Test basic endpoints
    const endpoints = [
      { path: '/api/auth/login', method: 'POST', expectedStatus: 400 }, // Should fail without credentials
      { path: '/api/auth/register', method: 'POST', expectedStatus: 400 }, // Should fail without data
      { path: '/api/auth/user', method: 'GET', expectedStatus: 401 }, // Should require auth
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(`${this.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status !== endpoint.expectedStatus) {
        throw new Error(`Endpoint ${endpoint.path} returned ${response.status}, expected ${endpoint.expectedStatus}`);
      }
    }

    // Test password validation
    const weakPasswordResponse = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: '123' // Weak password
      })
    });

    if (weakPasswordResponse.ok) {
      throw new Error('Password validation not working - weak password accepted');
    }
  }

  private async validateSecurity(): Promise<{ passed: boolean; errors: string[]; warnings: string[] }> {
    const securityTester = new SecurityTester(this.baseUrl);
    const securityResults = await securityTester.runAllSecurityTests();
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    let criticalFailures = 0;
    let highFailures = 0;
    
    for (const [testName, result] of Object.entries(securityResults)) {
      if (!result.passed) {
        if (result.severity === 'critical') {
          criticalFailures++;
          errors.push(`CRITICAL: ${testName} - ${result.message}`);
        } else if (result.severity === 'high') {
          highFailures++;
          errors.push(`HIGH: ${testName} - ${result.message}`);
        } else if (result.severity === 'medium') {
          warnings.push(`MEDIUM: ${testName} - ${result.message}`);
        } else {
          warnings.push(`LOW: ${testName} - ${result.message}`);
        }
      }
    }
    
    // Security validation passes if no critical or high severity failures
    const passed = criticalFailures === 0 && highFailures === 0;
    
    return { passed, errors, warnings };
  }

  private async validatePerformance(): Promise<{ passed: boolean; errors: string[]; warnings: string[] }> {
    const loadTester = new LoadTester(this.baseUrl);
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Test login endpoint performance
    const loginTest = await loadTester.runLoadTest({
      endpoint: '/api/auth/login',
      method: 'POST',
      body: { email: 'test@example.com', password: 'wrongpassword' },
      concurrency: 5,
      duration: 10
    });
    
    if (loginTest.averageResponseTime > 2000) {
      errors.push(`Login endpoint too slow: ${loginTest.averageResponseTime}ms average`);
    } else if (loginTest.averageResponseTime > 1000) {
      warnings.push(`Login endpoint slow: ${loginTest.averageResponseTime}ms average`);
    }
    
    if (loginTest.requestsPerSecond < 5) {
      errors.push(`Login endpoint low throughput: ${loginTest.requestsPerSecond} req/s`);
    } else if (loginTest.requestsPerSecond < 10) {
      warnings.push(`Login endpoint moderate throughput: ${loginTest.requestsPerSecond} req/s`);
    }
    
    // Test session validation performance
    const sessionTest = await loadTester.runLoadTest({
      endpoint: '/api/auth/user',
      method: 'GET',
      concurrency: 10,
      duration: 10
    });
    
    if (sessionTest.averageResponseTime > 500) {
      errors.push(`Session validation too slow: ${sessionTest.averageResponseTime}ms average`);
    } else if (sessionTest.averageResponseTime > 200) {
      warnings.push(`Session validation slow: ${sessionTest.averageResponseTime}ms average`);
    }
    
    const passed = errors.length === 0;
    return { passed, errors, warnings };
  }

  generateValidationReport(result: DeploymentValidationResult): string {
    let report = '\n=== Deployment Validation Report ===\n\n';
    
    report += `Database: ${result.database ? '✓ PASS' : '✗ FAIL'}\n`;
    report += `Authentication: ${result.authentication ? '✓ PASS' : '✗ FAIL'}\n`;
    report += `Security: ${result.security ? '✓ PASS' : '✗ FAIL'}\n`;
    report += `Performance: ${result.performance ? '✓ PASS' : '✗ FAIL'}\n\n`;
    
    const overallPass = result.database && result.authentication && result.security && result.performance;
    report += `Overall Status: ${overallPass ? '✅ READY FOR PRODUCTION' : '❌ NOT READY FOR PRODUCTION'}\n\n`;
    
    if (result.errors.length > 0) {
      report += '🚨 ERRORS (Must be fixed before deployment):\n';
      result.errors.forEach(error => {
        report += `  - ${error}\n`;
      });
      report += '\n';
    }
    
    if (result.warnings.length > 0) {
      report += '⚠️  WARNINGS (Should be addressed):\n';
      result.warnings.forEach(warning => {
        report += `  - ${warning}\n`;
      });
      report += '\n';
    }
    
    if (overallPass) {
      report += '🎉 All validation checks passed! The authentication system is ready for production deployment.\n';
    } else {
      report += '🔧 Please address the errors above before deploying to production.\n';
    }
    
    return report;
  }
}

// CLI interface
if (require.main === module) {
  const validator = new DeploymentValidator();
  
  validator.validateDeployment().then(result => {
    const report = validator.generateValidationReport(result);
    console.log(report);
    
    // Exit with error code if validation failed
    const overallPass = result.database && result.authentication && result.security && result.performance;
    process.exit(overallPass ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed with error:', error);
    process.exit(1);
  });
}