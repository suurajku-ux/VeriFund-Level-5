Write-Host "=== VeriFund Contract Deployer (Stellar Testnet for Windows) ===" -ForegroundColor Cyan

# Step 1: Build the contract to WASM
Write-Host "Building smart contract using stellar contract build..." -ForegroundColor Yellow
stellar contract build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Build failed." -ForegroundColor Red
    exit 1
}

$WasmPath = "target/wasm32v1-none/release/verifund.wasm"
if (-not (Test-Path $WasmPath)) {
    Write-Host "Error: WASM file not found at $WasmPath" -ForegroundColor Red
    exit 1
}
Write-Host "WASM build successful." -ForegroundColor Green

# Step 2: Ensure we have a funded key
Write-Host "Checking Stellar keys..." -ForegroundColor Yellow
$KeysList = stellar keys ls 2>$null
if ($KeysList -notmatch "verifund_deployer") {
    Write-Host "Key 'verifund_deployer' not found. Generating a new funded key..." -ForegroundColor Yellow
    stellar keys generate verifund_deployer --network testnet --fund
    Write-Host "Key 'verifund_deployer' generated and funded by Friendbot." -ForegroundColor Green
} else {
    Write-Host "Key 'verifund_deployer' found. Using existing key." -ForegroundColor Green
}

# Step 3: Deploy contract
Write-Host "Deploying contract to Stellar Testnet..." -ForegroundColor Yellow
$ContractId = & stellar contract deploy --wasm $WasmPath --source verifund_deployer --network testnet
if ($LASTEXITCODE -ne 0 -or -not $ContractId) {
    Write-Host "Error: Contract deployment failed." -ForegroundColor Red
    exit 1
}

# Trim whitespace/newlines
$ContractId = $ContractId.Trim()
Write-Host "Contract deployed successfully!" -ForegroundColor Green
Write-Host "Contract Address: $ContractId" -ForegroundColor Cyan

# Step 4: Initialize contract with Native XLM token on Testnet
$NativeXlm = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
Write-Host "Initializing VeriFund contract with native XLM token..." -ForegroundColor Yellow
$InitTx = & stellar contract invoke --id $ContractId --source verifund_deployer --network testnet -- initialize --token $NativeXlm
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Smart contract initialization failed." -ForegroundColor Red
    exit 1
}
Write-Host "Initialization TX: $InitTx" -ForegroundColor Green
Write-Host "VeriFund is initialized and ready to use!" -ForegroundColor Green

# Save the contract address to a file for the frontend to import
Write-Host "Saving contract address to frontend/src/contract_address.json..." -ForegroundColor Yellow
if (-not (Test-Path "frontend/src")) {
    New-Item -ItemType Directory -Path "frontend/src" -Force | Out-Null
}
$JsonContent = '{"contract_address": "' + $ContractId + '"}'
Set-Content -Path "frontend/src/contract_address.json" -Value $JsonContent -Force

Write-Host "=== Deployment Done! ===" -ForegroundColor Green
