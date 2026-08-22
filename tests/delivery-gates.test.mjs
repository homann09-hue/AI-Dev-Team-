import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentProbeUrl, evaluateDeploymentChecks, evaluateGithubChecks, validateLiveUrl, validatePullRequest } from '../scripts/lib/delivery-gates.mjs';

test('GitHub Actions gate requires real successful workflow checks', () => {
  assert.equal(evaluateGithubChecks([]).state, 'pending');
  assert.equal(evaluateGithubChecks([{ __typename: 'CheckRun', workflowName: 'CI', name: 'test', status: 'IN_PROGRESS' }]).state, 'pending');
  assert.equal(evaluateGithubChecks([{ __typename: 'CheckRun', workflowName: 'CI', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }]).state, 'failed');
  assert.equal(evaluateGithubChecks([{ __typename: 'CheckRun', workflowName: 'CI', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }]).state, 'passed');
});

test('deployment gate requires a successful deployment context', () => {
  assert.equal(evaluateDeploymentChecks([]).state, 'missing');
  assert.equal(evaluateDeploymentChecks([{ __typename: 'StatusContext', context: 'Vercel', state: 'PENDING' }]).state, 'pending');
  assert.equal(evaluateDeploymentChecks([{ __typename: 'StatusContext', context: 'Vercel', state: 'FAILURE' }]).state, 'failed');
  assert.equal(evaluateDeploymentChecks([{ __typename: 'StatusContext', context: 'Vercel', state: 'SUCCESS' }]).state, 'passed');
});

test('PR and live URL validation fail closed', () => {
  const pr = { number: 4, url: 'https://github.com/o/r/pull/4', state: 'OPEN', headRefName: 'agent', baseRefName: 'main' };
  assert.equal(validatePullRequest(pr, { head: 'agent', base: 'main' }), pr);
  assert.throws(() => validatePullRequest({ ...pr, state: 'CLOSED' }, { head: 'agent', base: 'main' }), /not open/);
  assert.equal(validateLiveUrl('https://example.com/health').origin, 'https://example.com');
  assert.throws(() => validateLiveUrl('http://example.com'), /HTTPS/);
  assert.equal(deploymentProbeUrl('https://app.vercel.app/api/health', 'https://app-feature-team.vercel.app').pathname, '/api/health');
  assert.throws(() => deploymentProbeUrl('https://app.vercel.app/health', 'https://attacker.example'), /not allowed/);
});
