import { expect, it } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { commitTeamRepo } from '../helpers/team-repo-history.js';

const cli = fileURLToPath(new URL('../../../dist/index.js', import.meta.url));

// A member with no role gets the shared skills/release, not skills/web/release,
// and pull names the copy it skipped (#1577). `web` lists after `release`, so a
// sorted directory listing would have delivered the namespace copy.
it('delivers the shared skill over a namespace skill of the same name and names the skipped copy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamai-shared-skill-wins-'));
  try {
    const home = path.join(root, 'home');
    const seed = path.join(root, 'seed');
    const repo = path.join(home, '.teamai', 'team-repo');
    for (const dir of [path.join(seed, 'skills', 'release'), path.join(seed, 'skills', 'web', 'release'), path.dirname(repo), path.join(home, '.claude')]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(seed, 'teamai.yaml'), YAML.stringify({ team: 'shared-skill-wins', repo: seed, provider: 'git', usageReport: false }));
    fs.writeFileSync(path.join(seed, 'skills', 'release', 'SKILL.md'), '---\nname: release\ndescription: Shared\n---\nShared release skill.\n');
    fs.writeFileSync(path.join(seed, 'skills', 'web', 'release', 'SKILL.md'), '---\nname: release\ndescription: Web\n---\nWeb release skill.\n');
    commitTeamRepo(seed);
    execFileSync('git', ['clone', '-q', seed, repo]);
    fs.writeFileSync(path.join(home, '.teamai', 'config.yaml'), YAML.stringify({ repo: { localPath: repo, remote: seed }, username: 'tester', scope: 'user', enabledAgents: ['claude'], updatePolicy: 'skip' }));
    const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), FORCE_COLOR: '0' };

    const pull = spawnSync(process.execPath, [cli, 'pull', '--force'], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });

    const output = pull.stdout + pull.stderr;
    expect(pull.status, output).toBe(0);
    expect(fs.readFileSync(path.join(home, '.claude', 'skills', 'release', 'SKILL.md'), 'utf8')).toContain('Shared release skill.');
    expect(output.match(/Skipped skills\/web\/release: the shared skills\/release has the same name\. Give this member a role that receives web to get it instead\./g)).toHaveLength(1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
