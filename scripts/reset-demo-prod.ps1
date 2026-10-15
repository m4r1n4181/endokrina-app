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

# Windows PowerShell 5.1 turns ANY stderr line of a native command (e.g. az's "You have 2 update(s)
# available" warning) into a terminating error while $ErrorActionPreference is 'Stop' — even when it
# is redirected to $null. So every native call runs with 'Continue' and is judged by its exit code.
function Invoke-Native {
  param([string]$Exe, [string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Exe @Arguments 2>$null
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return [pscustomobject]@{ Output = $output; ExitCode = $code }
}

function Invoke-Az {
  # Runs az, fails on a non-zero exit, returns stdout only (warnings go to stderr and are dropped).
  $result = Invoke-Native -Exe 'az' -Arguments ($args + '--only-show-errors')
  if ($result.ExitCode -ne 0) { throw "az $($args -join ' ') nije uspio (exit $($result.ExitCode))." }
  return $result.Output
}

# Azure CLI is renaming the firewall-rule flags (server: -n -> --server-name, rule: --rule-name -> --name).
# Its --help text already mentions --server-name in a deprecation warning, so it cannot be used to detect
# the version. Instead: try today's syntax, and if the CLI rejects it, the new one.
function Invoke-FirewallRule([string]$Action, [string[]]$Extra) {
  $base = @('postgres', 'flexible-server', 'firewall-rule', $Action, '-g', $RG)
  $current = Invoke-Native -Exe 'az' -Arguments ($base + @('--name', $PgServer, '--rule-name', $RuleName) + $Extra + @('-o', 'none', '--only-show-errors'))
  if ($current.ExitCode -eq 0) { return $true }
  $renamed = Invoke-Native -Exe 'az' -Arguments ($base + @('--server-name', $PgServer, '--name', $RuleName) + $Extra + @('-o', 'none', '--only-show-errors'))
  return ($renamed.ExitCode -eq 0)
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
  if (-not (Invoke-FirewallRule 'create' @('--start-ip-address', $ip, '--end-ip-address', $ip))) {
    throw "Firewall pravilo nije napravljeno. Provjeri 'az login' i prava na $PgServer."
  }
  $ruleCreated = $true

  Step 'Osvjezavam demo podatke...'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'   # pnpm/node warnings on stderr must not abort (see Invoke-Native)
  try {
    & pnpm run db:reset:demo
    $resetExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($resetExit -ne 0) { throw "Reset nije uspio (exit $resetExit). Mozes ga pokrenuti ponovo - brise samo demo podatke." }
  Step 'Gotovo. Otvori aplikaciju i osvjezi stranicu.'
}
finally {
  if ($ruleCreated) {
    Step "Zatvaram firewall pravilo $RuleName..."
    if (-not (Invoke-FirewallRule 'delete' @('--yes'))) {
      Write-Warning "Obrisi pravilo rucno u Azure portalu (Networking na $PgServer): $RuleName"
    }
  }
  foreach ($key in $appEnv.Keys) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
}
