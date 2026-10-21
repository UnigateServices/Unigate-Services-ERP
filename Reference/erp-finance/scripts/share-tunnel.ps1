# Quick share link for demos (Cloudflare TryCloudflare — free, no account).
# Prereqs: `npm run dev` running, cloudflared on PATH (winget install Cloudflare.cloudflared).
#
# Remote visitors must hit the web app only; API goes through Next rewrites on port 3000.
# Use apps/web/.env.local with NEXT_PUBLIC_API_URL empty (see .env.share.example).

$ErrorActionPreference = "Stop"
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared not found. Install: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting tunnel to http://localhost:3000 ..."
Write-Host "Copy the https://....trycloudflare.com URL when it appears." -ForegroundColor Cyan
Write-Host "Stop with Ctrl+C. The URL will not work after that." -ForegroundColor DarkGray
cloudflared tunnel --url http://localhost:3000
