const DEPLOYMENT_CONTEXT = /(vercel|deploy|deployment|pages|netlify|cloudflare)/i;

export function evaluateGithubChecks(rollup) {
  const actions = (rollup ?? []).filter((entry) => entry?.__typename === 'CheckRun' && entry.workflowName);
  if (actions.length === 0) return { state: 'pending', summary: 'Waiting for at least one GitHub Actions check' };
  const pending = actions.filter((entry) => entry.status !== 'COMPLETED');
  if (pending.length) return { state: 'pending', summary: `Waiting for GitHub Actions: ${pending.map((entry) => `${entry.workflowName}/${entry.name}`).join(', ')}` };
  const failed = actions.filter((entry) => entry.conclusion !== 'SUCCESS');
  if (failed.length) return { state: 'failed', summary: `GitHub Actions failed: ${failed.map((entry) => `${entry.workflowName}/${entry.name}=${entry.conclusion}`).join(', ')}` };
  return { state: 'passed', summary: `GitHub Actions passed: ${actions.map((entry) => `${entry.workflowName}/${entry.name}`).join(', ')}` };
}

export function evaluateDeploymentChecks(rollup) {
  const deployments = (rollup ?? []).filter((entry) => entry?.__typename === 'StatusContext' && DEPLOYMENT_CONTEXT.test(entry.context ?? ''));
  if (deployments.length === 0) return { state: 'missing', summary: 'No deployment status context exists for the PR head' };
  const pending = deployments.filter((entry) => ['PENDING', 'EXPECTED'].includes(entry.state));
  if (pending.length) return { state: 'pending', summary: `Waiting for deployment: ${pending.map((entry) => entry.context).join(', ')}` };
  const failed = deployments.filter((entry) => entry.state !== 'SUCCESS');
  if (failed.length) return { state: 'failed', summary: `Deployment failed: ${failed.map((entry) => `${entry.context}=${entry.state}`).join(', ')}` };
  return { state: 'passed', summary: `Deployment passed: ${deployments.map((entry) => entry.context).join(', ')}` };
}

export function validatePullRequest(snapshot, expected) {
  if (!snapshot?.url || !Number.isInteger(snapshot.number)) throw new Error('GitHub did not return a valid pull request');
  if (snapshot.state !== 'OPEN') throw new Error(`Pull request is not open: ${snapshot.state ?? 'unknown'}`);
  if (snapshot.headRefName !== expected.head || snapshot.baseRefName !== expected.base) throw new Error('Pull request head/base does not match the delivered branch');
  return snapshot;
}

export function validateLiveUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Live verification URL is invalid'); }
  if (url.protocol !== 'https:') throw new Error('Live verification URL must use HTTPS');
  url.searchParams.set('ai_dev_team_verify', String(Date.now()));
  return url;
}

export function deploymentProbeUrl(configuredValue, deploymentValue) {
  const configured = validateLiveUrl(configuredValue);
  const deployment = validateLiveUrl(deploymentValue);
  const sameHost = deployment.hostname === configured.hostname;
  const vercelPreview = configured.hostname.endsWith('.vercel.app')
    && deployment.hostname.endsWith('.vercel.app')
    && deployment.hostname.startsWith(`${configured.hostname.split('.')[0]}-`);
  if (!sameHost && !vercelPreview) throw new Error(`Deployment host ${deployment.hostname} is not allowed by local live policy`);
  deployment.pathname = configured.pathname;
  deployment.search = configured.search;
  deployment.searchParams.set('ai_dev_team_verify', String(Date.now()));
  return deployment;
}
