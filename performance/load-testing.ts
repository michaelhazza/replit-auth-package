import { performance } from 'perf_hooks';

interface LoadTestConfig {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  concurrency: number;
  duration: number;
  rampUpTime?: number;
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  errors: Array<{ status: number; count: number; message: string }>;
}

export class LoadTester {
  private baseUrl: string;
  
  constructor(baseUrl: string = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
    const results: Array<{ success: boolean; responseTime: number; status: number; error?: string }> = [];
    const startTime = Date.now();
    const endTime = startTime + (config.duration * 1000);
    const rampUpDuration = (config.rampUpTime || 0) * 1000;
    
    const workers: Promise<void>[] = [];
    
    for (let i = 0; i < config.concurrency; i++) {
      const workerDelay = rampUpDuration > 0 ? (i * rampUpDuration) / config.concurrency : 0;
      workers.push(this.createWorker(config, startTime + workerDelay, endTime, results));
    }
    
    await Promise.all(workers);
    return this.calculateResults(results, config.duration);
  }

  private async createWorker(
    config: LoadTestConfig, 
    startTime: number, 
    endTime: number, 
    results: Array<{ success: boolean; responseTime: number; status: number; error?: string }>
  ): Promise<void> {
    const delay = startTime - Date.now();
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    while (Date.now() < endTime) {
      const requestStart = performance.now();
      
      try {
        const response = await fetch(`${this.baseUrl}${config.endpoint}`, {
          method: config.method,
          headers: {
            'Content-Type': 'application/json',
            ...config.headers
          },
          body: config.body ? JSON.stringify(config.body) : undefined
        });
        
        const requestEnd = performance.now();
        const responseTime = requestEnd - requestStart;
        
        results.push({
          success: response.ok,
          responseTime,
          status: response.status,
          error: response.ok ? undefined : await response.text()
        });
        
      } catch (error: any) {
        const requestEnd = performance.now();
        const responseTime = requestEnd - requestStart;
        
        results.push({
          success: false,
          responseTime,
          status: 0,
          error: error.message
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  private calculateResults(
    results: Array<{ success: boolean; responseTime: number; status: number; error?: string }>, 
    duration: number
  ): LoadTestResult {
    const totalRequests = results.length;
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;
    
    const responseTimes = results.map(r => r.responseTime);
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / totalRequests;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    
    const requestsPerSecond = totalRequests / duration;
    const errorRate = (failedRequests / totalRequests) * 100;
    
    const errorGroups = new Map<number, { count: number; message: string }>();
    results.filter(r => !r.success).forEach(result => {
      const key = result.status;
      const existing = errorGroups.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorGroups.set(key, { count: 1, message: result.error || 'Unknown error' });
      }
    });
    
    const errors = Array.from(errorGroups.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      message: data.message
    }));
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      minResponseTime: Math.round(minResponseTime * 100) / 100,
      maxResponseTime: Math.round(maxResponseTime * 100) / 100,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      errors
    };
  }

  async testAuthenticationEndpoints(): Promise<Record<string, LoadTestResult>> {
    const authTests = [
      {
        name: 'login_endpoint',
        config: {
          endpoint: '/api/auth/login',
          method: 'POST' as const,
          body: { email: 'test@example.com', password: 'password123' },
          concurrency: 10,
          duration: 30
        }
      },
      {
        name: 'session_validation',
        config: {
          endpoint: '/api/auth/user',
          method: 'GET' as const,
          concurrency: 20,
          duration: 30
        }
      }
    ];
    
    const results: Record<string, LoadTestResult> = {};
    
    for (const test of authTests) {
      results[test.name] = await this.runLoadTest(test.config);
    }
    
    return results;
  }

  generateReport(results: Record<string, LoadTestResult>): string {
    let report = '\n=== Load Test Report ===\n\n';
    
    for (const [testName, result] of Object.entries(results)) {
      report += `Test: ${testName}\n`;
      report += `  Total Requests: ${result.totalRequests}\n`;
      report += `  Successful: ${result.successfulRequests} (${100 - result.errorRate}%)\n`;
      report += `  Failed: ${result.failedRequests} (${result.errorRate}%)\n`;
      report += `  Avg Response Time: ${result.averageResponseTime}ms\n`;
      report += `  Requests/Second: ${result.requestsPerSecond}\n\n`;
    }
    
    return report;
  }
}