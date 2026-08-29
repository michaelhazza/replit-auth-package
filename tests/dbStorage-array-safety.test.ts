import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('bulk user-operation SQL safety', () => {
  it('uses scalar inArray predicates and treats empty batches as no-ops', () => {
    const source = readFileSync(new URL('../server/dbStorage.ts', import.meta.url), 'utf8');
    const bulkOperations = source.slice(
      source.indexOf('async bulkUpdateUserRoles'),
      source.indexOf('async exportUserData'),
    );

    expect(bulkOperations).toContain('if (userIds.length === 0) return;');
    expect(bulkOperations.match(/inArray\(users\.id, userIds\)/g)).toHaveLength(2);
    expect(bulkOperations).not.toMatch(/ANY\s*\(/);
  });
});
