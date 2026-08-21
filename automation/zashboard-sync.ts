import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface SyncMetadata {
  releaseTag: string
  releaseSha: string
  expectedProviderSha: string
  candidateSha: string
  providerChanged: boolean
}

interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
}

interface ExistingIssue {
  number: number
  html_url: string
  title: string
}

const stage = process.argv[2]

async function command(cwd: string, args: string[]): Promise<string> {
  const process = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe', env: Bun.env })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode !== 0) {
    const detail = stderr.trim().split('\n').slice(-8).join('\n')
    throw new Error(
      `${args[0]} ${args.slice(1).join(' ')} failed (${exitCode})${detail ? `\n${detail}` : ''}`,
    )
  }
  return stdout.trim()
}

async function publicGitHub<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cagedbird-zashboard-sync',
  }
  const token = Bun.env.GITHUB_TOKEN || Bun.env.GH_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`https://api.github.com${path}`, { headers })
  if (!response.ok) throw new Error(`GitHub public API ${path} failed (${response.status})`)
  return response.json() as Promise<T>
}

function writeOutputs(metadata: SyncMetadata): void {
  const output = Bun.env.GITHUB_OUTPUT
  if (!output) return
  appendFileSync(
    output,
    `provider_changed=${metadata.providerChanged}\nrelease_tag=${metadata.releaseTag}\n`,
  )
}

async function prepare(): Promise<void> {
  const upstreamRepository = Bun.env.UPSTREAM_REPOSITORY?.trim() || 'Zephyruso/zashboard'
  const forkRepository =
    Bun.env.FORK_REPOSITORY?.trim() || Bun.env.GITHUB_REPOSITORY?.trim() || 'cagedbird043/zashboard'
  const providerBranch = Bun.env.PROVIDER_BRANCH?.trim() || 'cagedbird/providers'
  const outputDirectory = Bun.env.SYNC_OUTPUT_DIR?.trim() || join(process.cwd(), 'sync-output')
  mkdirSync(outputDirectory, { recursive: true })
  const release = await publicGitHub<GitHubRelease>(`/repos/${upstreamRepository}/releases/latest`)
  if (release.draft || release.prerelease || !release.tag_name)
    throw new Error('Latest GitHub release is not an official stable release')

  const work = mkdtempSync(join(tmpdir(), 'zashboard-sync-'))
  const repository = join(work, 'repository')
  try {
    await command(work, [
      'git',
      '-c',
      'core.hooksPath=/dev/null',
      'clone',
      '--filter=blob:none',
      '--no-checkout',
      `https://github.com/${forkRepository}.git`,
      repository,
    ])
    await command(repository, [
      'git',
      'remote',
      'add',
      'upstream',
      `https://github.com/${upstreamRepository}.git`,
    ])
    const remoteRefs = await command(repository, [
      'git',
      'ls-remote',
      '--heads',
      'origin',
      `refs/heads/${providerBranch}`,
    ])
    if (!remoteRefs.includes(`refs/heads/${providerBranch}`)) {
      throw new Error('Fork bootstrap is incomplete: generated Provider branch does not exist')
    }
    await command(repository, [
      'git',
      '-c',
      'core.hooksPath=/dev/null',
      'fetch',
      '--no-tags',
      'origin',
      `refs/heads/${providerBranch}:refs/remotes/origin/${providerBranch}`,
    ])
    await command(repository, [
      'git',
      '-c',
      'core.hooksPath=/dev/null',
      'fetch',
      '--no-tags',
      'upstream',
      `refs/tags/${release.tag_name}:refs/tags/${release.tag_name}`,
    ])

    const expectedProviderSha = await command(repository, [
      'git',
      'rev-parse',
      `refs/remotes/origin/${providerBranch}`,
    ])
    const releaseSha = await command(repository, [
      'git',
      'rev-parse',
      `refs/tags/${release.tag_name}^{commit}`,
    ])
    const oldBase = await command(repository, [
      'git',
      'merge-base',
      expectedProviderSha,
      releaseSha,
    ])
    const providerChanged = oldBase !== releaseSha

    await command(repository, ['git', 'checkout', '-B', 'candidate', expectedProviderSha])
    if (providerChanged) {
      await command(repository, [
        'git',
        '-c',
        'core.hooksPath=/dev/null',
        'rebase',
        '--onto',
        releaseSha,
        oldBase,
        'candidate',
      ])
    }
    const candidateSha = await command(repository, ['git', 'rev-parse', 'candidate'])
    const metadata: SyncMetadata = {
      releaseTag: release.tag_name,
      releaseSha,
      expectedProviderSha,
      candidateSha,
      providerChanged,
    }
    writeFileSync(
      join(outputDirectory, 'sync-metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`,
    )
    await command(repository, [
      'git',
      'bundle',
      'create',
      join(outputDirectory, 'candidate.bundle'),
      'refs/heads/candidate',
    ])
    writeOutputs(metadata)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function readMetadata(): SyncMetadata {
  const outputDirectory = Bun.env.SYNC_OUTPUT_DIR?.trim() || join(process.cwd(), 'sync-output')
  return JSON.parse(
    readFileSync(join(outputDirectory, 'sync-metadata.json'), 'utf8'),
  ) as SyncMetadata
}

async function validate(): Promise<void> {
  const outputDirectory = Bun.env.SYNC_OUTPUT_DIR?.trim() || join(process.cwd(), 'sync-output')
  const metadata = readMetadata()
  const work = mkdtempSync(join(tmpdir(), 'zashboard-validate-'))
  const repository = join(work, 'candidate')
  try {
    await command(work, [
      'git',
      'clone',
      '--branch',
      'candidate',
      join(outputDirectory, 'candidate.bundle'),
      repository,
    ])
    const candidateSha = await command(repository, ['git', 'rev-parse', 'HEAD'])
    if (candidateSha !== metadata.candidateSha)
      throw new Error('Candidate bundle SHA does not match prepared metadata')
    await command(repository, [
      'corepack',
      'pnpm',
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    await command(repository, ['corepack', 'pnpm', 'test'])
    await command(repository, ['corepack', 'pnpm', 'type-check'])
    await command(repository, ['corepack', 'pnpm', 'exec', 'eslint', '.'])
    await command(repository, ['corepack', 'pnpm', 'build'])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

async function promote(): Promise<void> {
  const forkRepository =
    Bun.env.FORK_REPOSITORY?.trim() || Bun.env.GITHUB_REPOSITORY?.trim() || 'cagedbird043/zashboard'
  const providerBranch = Bun.env.PROVIDER_BRANCH?.trim() || 'cagedbird/providers'
  const outputDirectory = Bun.env.SYNC_OUTPUT_DIR?.trim() || join(process.cwd(), 'sync-output')
  const metadata = readMetadata()
  const work = mkdtempSync(join(tmpdir(), 'zashboard-promote-'))
  const repository = join(work, 'repository')
  try {
    await command(work, [
      'git',
      '-c',
      'core.hooksPath=/dev/null',
      'clone',
      '--filter=blob:none',
      '--no-checkout',
      `https://github.com/${forkRepository}.git`,
      repository,
    ])
    await command(repository, [
      'git',
      '-c',
      'core.hooksPath=/dev/null',
      'fetch',
      '--no-tags',
      'origin',
      `refs/heads/${providerBranch}:refs/remotes/origin/${providerBranch}`,
    ])
    const currentProvider = await command(repository, [
      'git',
      'rev-parse',
      `refs/remotes/origin/${providerBranch}`,
    ])
    if (currentProvider !== metadata.expectedProviderSha) {
      throw new Error('Provider ref changed after validation; refusing stale promotion')
    }

    if (metadata.providerChanged) {
      await command(repository, [
        'git',
        'fetch',
        join(outputDirectory, 'candidate.bundle'),
        'refs/heads/candidate:refs/remotes/bundle/candidate',
      ])
      const bundledCandidate = await command(repository, [
        'git',
        'rev-parse',
        'refs/remotes/bundle/candidate',
      ])
      if (bundledCandidate !== metadata.candidateSha)
        throw new Error('Validated candidate bundle changed before promotion')
      await command(repository, [
        'git',
        'push',
        'origin',
        `--force-with-lease=refs/heads/${providerBranch}:${metadata.expectedProviderSha}`,
        `${metadata.candidateSha}:refs/heads/${providerBranch}`,
      ])
      const deploymentTag = `cagedbird/providers/${metadata.releaseTag}`
      const existingTag = await command(repository, [
        'git',
        'ls-remote',
        '--tags',
        'origin',
        `refs/tags/${deploymentTag}`,
      ])
      if (existingTag && !existingTag.startsWith(`${metadata.candidateSha}\t`)) {
        throw new Error(`Immutable deployment tag already points elsewhere: ${deploymentTag}`)
      }
      if (!existingTag)
        await command(repository, [
          'git',
          'push',
          'origin',
          `${metadata.candidateSha}:refs/tags/${deploymentTag}`,
        ])
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

async function githubApi<T>(
  path: string,
  init: RequestInit = {},
  allowMissing = false,
): Promise<T | undefined> {
  const token = Bun.env.GITHUB_TOKEN || Bun.env.GH_TOKEN
  if (!token) throw new Error('Missing GITHUB_TOKEN or GH_TOKEN for GitHub API call')
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'cagedbird-zashboard-sync',
      ...init.headers,
    },
  })
  if (allowMissing && response.status === 404) return undefined
  if (!response.ok) throw new Error(`GitHub API ${path} failed (${response.status})`)
  if (response.status === 204) return undefined
  return response.json() as Promise<T>
}

async function openSyncIssue(repository: string, body: string): Promise<ExistingIssue> {
  const issues = await githubApi<ExistingIssue[]>(
    `/repos/${repository}/issues?state=open&per_page=100`,
  )
  const existing = issues?.find(
    (issue) => issue.title === '[Zashboard sync] automatic promotion failed',
  )
  if (existing) {
    await githubApi(`/repos/${repository}/issues/${existing.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
    return existing
  }
  return (await githubApi<ExistingIssue>(`/repos/${repository}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: '[Zashboard sync] automatic promotion failed', body }),
  }))!
}

async function clearFailure(repository: string, runUrl: string): Promise<void> {
  const issues = await githubApi<ExistingIssue[]>(
    `/repos/${repository}/issues?state=open&per_page=100`,
  )
  const issue = issues?.find((item) => item.title === '[Zashboard sync] automatic promotion failed')
  if (issue) {
    await githubApi(`/repos/${repository}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Recovered successfully: ${runUrl}` }),
    })
    await githubApi(`/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    })
  }
}

export function failedSyncStage(
  prepareResult: string,
  validateResult: string,
  promoteResult: string,
): string | undefined {
  return [
    ['prepare', prepareResult],
    ['validate', validateResult],
    ['promote', promoteResult],
  ].find(([, result]) => !['success', 'skipped'].includes(result))?.[0]
}

async function notify(): Promise<void> {
  const repository =
    Bun.env.REPOSITORY?.trim() ||
    Bun.env.GITHUB_REPOSITORY?.trim() ||
    Bun.env.FORK_REPOSITORY?.trim() ||
    'cagedbird043/zashboard'
  const runUrl = Bun.env.RUN_URL?.trim() || 'unknown'
  const prepareResult = Bun.env.PREPARE_RESULT?.trim() || 'skipped'
  const validateResult = Bun.env.VALIDATE_RESULT?.trim() || 'skipped'
  const promoteResult = Bun.env.PROMOTE_RESULT?.trim() || 'skipped'
  const failedStage = failedSyncStage(prepareResult, validateResult, promoteResult)

  if (!failedStage) {
    await clearFailure(repository, runUrl)
    return
  }

  let metadata: Partial<SyncMetadata> = {}
  try {
    metadata = readMetadata()
  } catch {}
  const issueBody = [
    `Automatic Zashboard promotion failed during **${failedStage}**.`,
    metadata.releaseTag ? `Release: \`${metadata.releaseTag}\`` : undefined,
    metadata.candidateSha ? `Candidate: \`${metadata.candidateSha}\`` : undefined,
    `Run: ${runUrl}`,
    '',
    'The generated branch and production serving pointer remain at the last successful revision.',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
  await openSyncIssue(repository, issueBody)
}

if (import.meta.main) {
  try {
    if (stage === 'prepare') await prepare()
    else if (stage === 'validate') await validate()
    else if (stage === 'promote') await promote()
    else if (stage === 'notify') await notify()
    else
      throw new Error('Usage: bun automation/zashboard-sync.ts <prepare|validate|promote|notify>')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
