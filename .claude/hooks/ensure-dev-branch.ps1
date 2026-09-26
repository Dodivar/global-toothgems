<#
    SessionStart hook: make sure the session works on dev.

      - main checkout on another branch with a clean tree: switch to dev and
        fast-forward it from origin
      - linked worktree (desktop app isolation): dev cannot be checked out
        there, so only remind Claude that the Stop hook delivers to origin/dev
      - stdout is added to Claude's context; always exits 0
#>

$ErrorActionPreference = 'Continue'
$TargetBranch = 'dev'

try {
    $raw = [Console]::In.ReadToEnd()
    $payload = if ($raw) { $raw | ConvertFrom-Json } else { $null }
    $cwd = if ($payload -and $payload.cwd) { $payload.cwd } else { (Get-Location).Path }
    Set-Location -LiteralPath $cwd

    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { exit 0 }

    $gitDir = (Resolve-Path (git rev-parse --git-dir)).Path
    $commonDir = (Resolve-Path (git rev-parse --git-common-dir)).Path
    $isLinkedWorktree = $gitDir -ne $commonDir

    if ($branch -eq $TargetBranch) {
        git pull --ff-only origin $TargetBranch 2>$null | Out-Null
        Write-Output "Git policy: this session is on '$TargetBranch'. Work is committed and pushed to origin/$TargetBranch automatically at the end of each turn. Do not create other branches or pull requests."
        exit 0
    }

    if ($isLinkedWorktree) {
        Write-Output "Git policy: this session runs in a worktree on '$branch'. At the end of each turn the Stop hook commits and pushes this work directly to origin/$TargetBranch (merging origin/$TargetBranch first). Do not open a pull request and do not push '$branch' itself."
        exit 0
    }

    if (git status --porcelain) {
        Write-Output "Git policy: the working tree is on '$branch' with uncommitted changes, so it was NOT switched to '$TargetBranch'. Ask the user before doing anything: all work must land on '$TargetBranch'."
        exit 0
    }

    git switch $TargetBranch 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "Git policy: could not switch from '$branch' to '$TargetBranch'. Tell the user before making changes."
        exit 0
    }
    git pull --ff-only origin $TargetBranch 2>$null | Out-Null
    Write-Output "Git policy: switched from '$branch' to '$TargetBranch'. Work is committed and pushed to origin/$TargetBranch automatically at the end of each turn. Do not create other branches or pull requests."
}
catch {
    [Console]::Error.WriteLine("[ensure-dev-branch] unexpected error: $($_.Exception.Message)")
}

exit 0
