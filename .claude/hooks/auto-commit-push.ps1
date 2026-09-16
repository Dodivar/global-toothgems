<#
    Stop hook: auto-commit and auto-push the work of the turn.

    Safety rails:
      - only runs on the branch named in $TargetBranch (default: main)
      - no-op when the tree is clean
      - never blocks Claude: always exits 0
      - on a rejected push, rebases once on origin/<branch> and retries
#>

$ErrorActionPreference = 'Continue'
$TargetBranch = 'main'

function Write-HookLog([string]$Message) {
    [Console]::Error.WriteLine("[auto-commit-push] $Message")
}

try {
    $raw = [Console]::In.ReadToEnd()
    $payload = if ($raw) { $raw | ConvertFrom-Json } else { $null }

    $cwd = if ($payload -and $payload.cwd) { $payload.cwd } else { (Get-Location).Path }
    Set-Location -LiteralPath $cwd

    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { Write-HookLog "not a git repository: $cwd"; exit 0 }

    if ($branch -ne $TargetBranch) {
        Write-HookLog "on '$branch', not '$TargetBranch' - skipping"
        exit 0
    }

    $dirty = git status --porcelain
    if (-not $dirty) { Write-HookLog 'nothing to commit'; exit 0 }

    # Subject line from the last assistant message, else a generic one.
    $subject = 'Auto-commit from Claude Code session'
    if ($payload -and $payload.last_assistant_message) {
        $first = ($payload.last_assistant_message -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
        if ($first) {
            $first = ($first -replace '[`*_#>\[\]]', '').Trim()
            if ($first.Length -gt 72) { $first = $first.Substring(0, 69) + '...' }
            if ($first.Length -ge 10) { $subject = $first }
        }
    }

    git add -A
    if ($LASTEXITCODE -ne 0) { Write-HookLog 'git add failed'; exit 0 }

    git commit -m $subject -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
    if ($LASTEXITCODE -ne 0) { Write-HookLog 'git commit failed (nothing staged?)'; exit 0 }

    git push origin $TargetBranch
    if ($LASTEXITCODE -ne 0) {
        Write-HookLog 'push rejected - rebasing on origin and retrying once'
        git pull --rebase origin $TargetBranch
        if ($LASTEXITCODE -ne 0) {
            git rebase --abort 2>$null
            Write-HookLog 'rebase failed - commit is local only, resolve by hand'
            exit 0
        }
        git push origin $TargetBranch
        if ($LASTEXITCODE -ne 0) { Write-HookLog 'push still failing - commit is local only'; exit 0 }
    }

    Write-HookLog "pushed to origin/$TargetBranch : $subject"
}
catch {
    Write-HookLog "unexpected error: $($_.Exception.Message)"
}

exit 0
