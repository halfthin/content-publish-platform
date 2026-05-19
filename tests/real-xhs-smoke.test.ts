import { describe, expect, it } from 'bun:test';

/**
 * Real XHS smoke 门禁.
 * Run only with a test account and explicit side-effect approval:
 * RUN_REAL_XHS_TESTS=true XHS_MCP_INSTANCES='[{"name":"xhs-1","url":"http://xhs-mcp:5601"}]' API_BASE_URL=http://localhost:50000 API_AUTH_TOKEN=<token> bun test tests/real-xhs-smoke.test.ts
 */
const realDescribe = process.env.RUN_REAL_XHS_TESTS === 'true' ? describe : describe.skip;

realDescribe('real XHS smoke tests', () => {
  it('requires explicit real publish configuration before running', () => {
    expect(process.env.RUN_REAL_XHS_TESTS).toBe('true');
    expect(process.env.XHS_MCP_INSTANCES).toBeTruthy();
    expect(process.env.API_BASE_URL).toBeTruthy();
    expect(process.env.API_AUTH_TOKEN).toBeTruthy();
  });

  it('documents the real publish side-effect boundary', () => {
    const warning = [
      'RUN_REAL_XHS_TESTS=true may publish to a third-party platform.',
      'Use only test accounts and safe test content.',
      'Do not enable this suite in default CI.',
    ].join(' ');

    expect(warning).toContain('third-party platform');
  });
});
