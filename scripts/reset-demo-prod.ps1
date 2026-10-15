<#
  Osvjezi demo podatke na produkciji: istih 6 izmisljenih pacijenata, novi datumi od danas.

  Pokretanje (PowerShell, iz root foldera projekta):
      .\scripts\reset-demo-prod.ps1

  Treba: `az login` (pretplata Azure for Students) i `pnpm install`.

  Sta radi:
    1. Cita podesavanja i tajne aplikacije direktno iz Azure Container Appa
       (ne koristi .env ni secrets.txt, pa ne moze slucajno gadjati localhost ili LocalStack).
    2. Trazi potvrdu (upises RESET).
    3. Otvara firewall baze samo za tvoju IP adresu.
    4. Pokrece `pnpm run db:reset:demo`: brise samo demo pacijente (po izmisljenim brojevima telefona)
       i njihove termine kod demo doktora, pa ih ubaci ponovo sa danasnjim datumima.
       Nalozi osoblja, lozinke i sve ostalo ostaju netaknuti.
    5. Zatvara firewall pravilo (i kad nesto pukne).
#>
param(
  [string]$DemoDoctorEmail = 'doktor@endokrina.reden-raum.de',
  [string]$DemoAdminEmail = 'admin@endokrina.reden-raum.de'
)

$ErrorActionPreference = 'Stop'
$RG = 'thyroid-demo-rg'
$App = 'thyroid-demo-app'
$PgServer = 'thyroid-demo-db'
$RuleName = 'reset-demo-' + (Get-Date -Format 'yyyyMMddHHmmss')

function Step([string]$Message) { Write-Host "[$(Get-Date -Format HH:mm:ss)] $Message" }

function Invoke-Az {
  # Runs az, fails on a non-zero exit, returns stdout only (warnings go to stderr and are dropped).
  $output = & az @args --only-show-errors 2>$null
  if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') nije uspio (exit $LASTEXITCODE)." }
  return $output
}

if (-not (Test-Path '.\package.json') -or -not (Test-Path '.\artifacts\api-server')) {
  throw 'Pokreni skriptu iz root foldera projekta (tamo gdje je package.json).'
}

Step 'Provjeravam Azure prijavu...'
$account = (Invoke-Az account show -o json) -join "`n" | ConvertFrom-Json
Step "Pretplata: $($account.name)"

Step 'Citam podesavanja aplikacije iz Azure-a...'
$envList = (Invoke-Az containerapp show -n $App -g $RG --query 'properties.template.containers[0].env' -o json) -join "`n" | ConvertFrom-Json

$appEnv = @{}
foreach ($item in $envList) {
  if ($item.secretRef) {
    $appEnv[$item.name] = ((Invoke-Az containerapp secret show -n $App -g $RG --secret-name $item.secretRef --query value -o tsv) -join '').Trim()
  } elseif ($null -ne $item.value) {
    $appEnv[$item.name] = $item.value
  }
}

foreach ($required in 'DATABASE_URL', 'JWT_SECRET', 'MAGIC_LINK_SECRET') {
  if (-not $appEnv[$required]) { throw "Aplikacija na Azure-u nema $required - prekidam." }
}
$dbHost = ([regex]::Match($appEnv['DATABASE_URL'], '@([^:/?]+)')).Groups[1].Value
if ($dbHost -notlike "$PgServer.*") { throw "DATABASE_URL ne pokazuje na $PgServer (host je '$dbHost') - prekidam." }

Write-Host ''
Write-Host 'Ovo ce na PRODUKCIJI:'
Write-Host "  - obrisati demo pacijente i njihove termine, upitnike, sazetke i nalaze (doktor: $DemoDoctorEmail)"
Write-Host '  - ubaciti ih ponovo sa terminima od sutra i narednih dana'
Write-Host "  Baza: $dbHost   Storage: $($appEnv['STORAGE_PROVIDER']) $($appEnv['STORAGE_BUCKET'])"
Write-Host '  Nalozi osoblja i ono sto su posjetioci dodali ostaju netaknuti.'
Write-Host ''
if ((Read-Host 'Upisi RESET za nastavak') -cne 'RESET') { Step 'Odustala si - nista nije promijenjeno.'; exit 0 }

# Clean process environment: production values only, nothing from a local .env.
foreach ($name in 'AWS_ENDPOINT_URL', 'DATABASE_URL', 'STORAGE_PROVIDER', 'STORAGE_BUCKET') {
  Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}
foreach ($key in $appEnv.Keys) { Set-Item -Path "Env:$key" -Value $appEnv[$key] }
$env:DEMO_DOCTOR_EMAIL = $DemoDoctorEmail
$env:DEMO_ADMIN_EMAIL = $DemoAdminEmail

$ip = (Invoke-RestMethod -Uri 'https://api.ipify.org').ToString().Trim()
$ruleCreated = $false
try {
  Step "Otvaram firewall baze za $ip (pravilo $RuleName)..."
  $help = (& az postgres flexible-server firewall-rule create --help 2>$null) -join "`n"
  if ($help -match '--server-name') {
    Invoke-Az postgres flexible-server firewall-rule create -g $RG -s $PgServer -n $RuleName --start-ip-address $ip --end-ip-address $ip -o none | Out-Null
  } else {
    Invoke-Az postgres flexible-server firewall-rule create -g $RG -n $PgServer --rule-name $RuleName --start-ip-address $ip --end-ip-address $ip -o none | Out-Null
  }
  $ruleCreated = $true

  Step 'Osvjezavam demo podatke...'
  & pnpm run db:reset:demo
  if ($LASTEXITCODE -ne 0) { throw "Reset nije uspio (exit $LASTEXITCODE). Mozes ga pokrenuti ponovo - brise samo demo podatke." }
  Step 'Gotovo. Otvori aplikaciju i osvjezi stranicu.'
}
finally {
  if ($ruleCreated) {
    Step "Zatvaram firewall pravilo $RuleName..."
    $help = (& az postgres flexible-server firewall-rule delete --help 2>$null) -join "`n"
    if ($help -match '--server-name') {
      & az postgres flexible-server firewall-rule delete -g $RG -s $PgServer -n $RuleName --yes -o none --only-show-errors 2>$null
    } else {
      & az postgres flexible-server firewall-rule delete -g $RG -n $PgServer --rule-name $RuleName --yes -o none --only-show-errors 2>$null
    }
    if ($LASTEXITCODE -ne 0) { Write-Warning "Obrisi pravilo rucno u Azure portalu: $RuleName" }
  }
  foreach ($key in $appEnv.Keys) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
}
