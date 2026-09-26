<#
    Stop hook: auto-commit the work of the turn and deliver it to origin/dev.

    Behaviour by branch:
      - dev             : commit, push origin dev (rebase once on rejection)
      - main            : never commits, never pushes (release branch)
      - any other branch: (e.g. a claude/* worktree created by the desktop app)
                          commit locally, merge origin/dev into it, then push
                          HEAD directly to origin/dev - no feature branch push,
                          no pull request

    Safety rails:
      - never pushes to main, never force-pushes, never rewrites pushed history
      - on a merge conflict, aborts and leaves the commit local
      - never blocks Claude: always exits 0
#>

$ErrorActionPreference = 'Continue'
$TargetBranch = 'dev'
$ProtectedBranch = 'main'

function Write-HookLog([string]$Message) {
    [Console]::Error.WriteLine("[auto-commit-push] $Message")
}

function Commit-WorkingTree([object]$Payload) {
    $dirty = git status --porcelain
    if (-not $dirty) { return }

    # Subject line from the last assistant message, else a generic one.
    $subject = 'Auto-commit from Claude Code session'
    if ($Payload -and $Payload.last_assistant_message) {
        $first = ($Payload.last_assistant_message -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
        if ($first) {
            $first = ($first -replace '[`*_#>\[\]]', '').Trim()
            if ($first.Length -gt 72) { $first = $first.Substring(0, 69) + '...' }
            if ($first.Length -ge 10) { $subject = $first }
        }
    }

    git add -A
    if ($LASTEXITCODE -ne 0) { Write-HookLog 'git add failed'; return }

    git commit -m $subject -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
    if ($LASTEXITCODE -ne 0) { Write-HookLog 'git commit failed (nothing staged?)' }
}

# Push the current branch (dev) to origin/dev, rebasing once on rejection.
function Push-Dev {
    git push origin $TargetBranch
    if ($LASTEXITCODE -eq 0) { return $true }

    Write-HookLog 'push rejected - rebasing on origin and retrying once'
    git pull --rebase origin $TargetBranch
    if ($LASTEXITCODE -ne 0) {
        git rebase --abort 2>$null
        Write-HookLog 'rebase failed - commit is local only, resolve by hand'
        return $false
    }
    git push origin $TargetBranch
    return ($LASTEXITCODE -eq 0)
}

# Deliver the current (non-dev) branch straight into origin/dev.
function Push-HeadToDev {
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        git fetch origin $TargetBranch
        if ($LASTEXITCODE -ne 0) { Write-HookLog 'fetch failed'; return $false }

        $ahead = [int](git rev-list --count "origin/$TargetBranch..HEAD")
        if ($ahead -eq 0) { Write-HookLog "nothing new for origin/$TargetBranch"; return $true }

        # Merge rather than rebase: keeps history intact and never duplicates commits.
        git merge --no-edit "origin/$TargetBranch"
        if ($LASTEXITCODE -ne 0) {
            git merge --abort 2>$null
            Write-HookLog "merge with origin/$TargetBranch conflicts - commit is local only, resolve by hand"
            return $false
        }

        git push origin "HEAD:refs/heads/$TargetBranch"
        if ($LASTEXITCODE -eq 0) { return $true }
        Write-HookLog "push rejected (attempt $attempt)"
    }
    return $false
}

try {
    $raw = [Console]::In.ReadToEnd()
    $payload = if ($raw) { $raw | ConvertFrom-Json } else { $null }

    $cwd = if ($payload -and $payload.cwd) { $payload.cwd } else { (Get-Location).Path }
    Set-Location -LiteralPath $cwd

    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { Write-HookLog "not a git repository: $cwd"; exit 0 }

    if ($branch -eq $ProtectedBranch -or $branch -eq 'HEAD') {
        Write-HookLog "on '$branch' - refusing to commit; work belongs on '$TargetBranch'"
        exit 0
    }

    Commit-WorkingTree $payload

    $ok = if ($branch -eq $TargetBranch) { Push-Dev } else { Push-HeadToDev }
    if ($ok) { Write-HookLog "delivered '$branch' to origin/$TargetBranch" }
    else { Write-HookLog "could not deliver '$branch' to origin/$TargetBranch - commit is local only" }
}
catch {
    Write-HookLog "unexpected error: $($_.Exception.Message)"
}

exit 0
