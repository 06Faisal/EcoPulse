param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("06Faisal", "faisal613-mf")]
    [string]$Account
)

if ($Account -eq "06Faisal") {
    Write-Host "Switching to 06Faisal account..." -ForegroundColor Green
    git config user.name "06Faisal"
    git config user.email "ahmedfaisalshaik@gmail.com"
    git remote set-url origin https://github.com/06Faisal/EcoPulse.git
    Write-Host "Configured Git for 06Faisal." -ForegroundColor Cyan
} elseif ($Account -eq "faisal613-mf") {
    Write-Host "Switching to faisal613-mf account..." -ForegroundColor Green
    git config user.name "faisal613-mf"
    git config user.email "shaikfaisalahmed050405@gmail.com"
    # Assuming the original repo is on the first account, otherwise we stick to 06Faisal repo
    git remote set-url origin https://github.com/faisal613-mf/EcoPulse.git
    Write-Host "Configured Git for faisal613-mf." -ForegroundColor Cyan
}

Write-Host "Current Config:" -ForegroundColor Yellow
git config user.name
git remote -v
