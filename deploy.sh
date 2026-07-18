#!/bin/bash
set -e

echo "=== VeriFund Contract Deployer (Stellar Testnet) ==="

# Step 1: Build the contract to WASM
echo "Building Rust smart contract..."
cargo build --target wasm32-unknown-unknown --release

WASM_PATH="target/wasm32-unknown-unknown/release/verifund.wasm"
if [ ! -f "$WASM_PATH" ]; then
    echo "Error: WASM file not found at $WASM_PATH"
    exit 1
fi
echo "WASM build successful."

# Step 2: Ensure we have a funded key
echo "Checking Stellar keys..."
KEYS_LIST=$(stellar keys list 2>/dev/null || echo "")

if [[ ! "$KEYS_LIST" =~ "verifund_deployer" ]]; then
    echo "Key 'verifund_deployer' not found. Generating a new funded key..."
    stellar keys generate verifund_deployer --network testnet
    echo "Key 'verifund_deployer' generated and funded by Friendbot."
else
    echo "Key 'verifund_deployer' found. Using existing key."
fi

# Step 3: Deploy contract
echo "Deploying contract to Stellar Testnet..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source verifund_deployer \
  --network testnet)

echo "Contract deployed successfully!"
echo "Contract Address: $CONTRACT_ID"

# Native XLM Contract ID on Testnet is: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
NATIVE_XLM="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

echo "Initializing VeriFund contract with native XLM token..."
INIT_TX=$(stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source verifund_deployer \
  --network testnet \
  -- \
  initialize \
  --token "$NATIVE_XLM")

echo "Initialization TX: $INIT_TX"
echo "VeriFund is initialized and ready to use!"

# Save the contract address to a file for the frontend to import
echo "Saving contract address to frontend/src/contract_address.json..."
mkdir -p frontend/src
echo "{\"contract_address\": \"$CONTRACT_ID\"}" > frontend/src/contract_address.json

echo "=== Deployment Done! ==="
