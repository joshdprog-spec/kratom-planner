# Refreshes the supplier deal calendar, commits and pushes it if it changed,
# and shows a Windows notification listing the upcoming deals.
# Registered as a weekly scheduled task ("Kratom Planner deal refresh").

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$log = Join-Path $root "refresh.log"
"[$(Get-Date -Format s)] refresh start" | Out-File -Append -Encoding utf8 $log

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
& $node (Join-Path $root "refresh-supplier.js") 2>&1 | Out-File -Append -Encoding utf8 $log

$changed = git status --porcelain -- supplier-data.js
if ($changed) {
  git add supplier-data.js 2>&1 | Out-File -Append -Encoding utf8 $log
  git commit -q -m "Supplier data refresh $(Get-Date -Format yyyy-MM-dd)" 2>&1 | Out-File -Append -Encoding utf8 $log
  git push -q origin master 2>&1 | Out-File -Append -Encoding utf8 $log
}

# Read the promos back out of supplier-data.js for the notification
$raw = Get-Content (Join-Path $root "supplier-data.js") -Raw
$json = $raw.Substring($raw.IndexOf("{"))
$json = $json.Substring(0, $json.LastIndexOf("}") + 1)
$data = $json | ConvertFrom-Json
$lines = @()
foreach ($pm in $data.promos) {
  $start = ([DateTime]::Parse($pm.startsAt)).ToLocalTime().ToString("ddd M/d")
  $lines += "$start  $($pm.title)"
}
if ($lines.Count -eq 0) { $lines = @("No scheduled deals right now.") }
$body = ($lines | Select-Object -First 5) -join "`n"

try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
  $esc = [System.Security.SecurityElement]::Escape($body)
  $xml = "<toast><visual><binding template='ToastGeneric'><text>Super Speciosa deals</text><text>$esc</text></binding></visual></toast>"
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  "[$(Get-Date -Format s)] toast shown" | Out-File -Append -Encoding utf8 $log
} catch {
  "[$(Get-Date -Format s)] toast failed: $($_.Exception.Message)" | Out-File -Append -Encoding utf8 $log
}
"[$(Get-Date -Format s)] refresh done" | Out-File -Append -Encoding utf8 $log
