# BondokWeb3 ERC-721

A minimal smart contract for creating NFTs compatible with the **ERC-721** standard on EVM-compatible networks. The contract allows any address to mint a new token and provide a custom metadata URI for that token.

> **Project status:** This is a minimal educational example. It is not an audited contract or a production-ready NFT collection.

## Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Current Specifications](#current-specifications)
- [Requirements](#requirements)
- [Deploying with Remix](#deploying-with-remix)
- [Usage](#usage)
- [Metadata Format](#metadata-format)
- [JavaScript and ethers Integration](#javascript-and-ethers-integration)
- [Workflow](#workflow)
- [Security Considerations and Limitations](#security-considerations-and-limitations)
- [Preparing a Production Version](#preparing-a-production-version)
- [Testing](#testing)
- [License](#license)

## Overview

The contract in [`BondokWeb3.sol`](./BondokWeb3.sol) inherits from:

- `ERC721`: OpenZeppelin's core implementation of the NFT standard.
- `ERC721URIStorage`: support for storing a separate `tokenURI` for each token.

Collection settings:

| Item | Value |
| --- | --- |
| Collection name | `Bondok Web3` |
| Symbol | `BW3` |
| First token ID | `0` |
| Minting | Public, with no custom access control or fee |
| URI | Provided by the minter |
| Storage | Only the URI is stored on-chain; metadata and images are off-chain |
| Solidity license declaration | MIT |

## Project Structure

```text
.
├── BondokWeb3.sol     # Smart contract
├── nft-metadata.json   # Example NFT metadata
└── README.md          # Project documentation
```

### `BondokWeb3.sol`

The contract contains a private counter:

```solidity
uint256 private _tokenId;
```

Solidity initializes this value to `0`. Each time `mintNFT` is called, the contract:

1. Uses the current counter value as the new token ID.
2. Mints the token to `msg.sender`.
3. Stores the supplied `jsonUri` as the token's `tokenURI`.
4. Increments the counter by one.
5. Returns the newly created token ID.

### `nft-metadata.json`

This is an example of the JSON metadata commonly used by NFT marketplaces. It includes:

- `name`
- `description`
- `image`
- `attributes`

Keeping this file in the repository does not automatically upload it to IPFS or use it during minting. The JSON file must be hosted separately, and its URI must then be passed to `mintNFT`.

## Current Specifications

### `mintNFT`

```solidity
function mintNFT(string memory jsonUri) public returns (uint256)
```

| Parameter | Description |
| --- | --- |
| `jsonUri` | The NFT metadata URI, such as `ipfs://...` or an HTTPS URL |
| Return value | The newly created token ID |
| Recipient | The address that sends the transaction (`msg.sender`) |
| Fee | No custom fee; the caller only pays network gas |
| Permissions | Any address can call the function |

### Inherited ERC-721 Functions

Because the contract inherits from OpenZeppelin, it exposes standard ERC-721 functionality, including:

- `ownerOf(tokenId)` to read the current owner.
- `balanceOf(owner)` to read an owner's token balance.
- `tokenURI(tokenId)` to read the metadata URI.
- `approve(to, tokenId)` and `getApproved(tokenId)`.
- `setApprovalForAll(operator, approved)` and `isApprovedForAll(owner, operator)`.
- `transferFrom(from, to, tokenId)`.
- `safeTransferFrom(from, to, tokenId)`.
- `supportsInterface(interfaceId)` for interface detection.

## Requirements

- An EVM-compatible wallet, such as MetaMask, for deployment and interaction.
- A compatible Solidity compiler:

  ```text
  Solidity >= 0.8.31 and < 0.9.0
  ```

- OpenZeppelin Contracts.
- The network's native currency to pay gas.
- A service for hosting metadata and images. IPFS or Arweave is recommended for production.

The current contract imports OpenZeppelin directly from GitHub using remote URLs. This is convenient for a quick experiment, but it is not ideal for a reproducible production build. See [Preparing a Production Version](#preparing-a-production-version).

## Deploying with Remix

Remix is the fastest way to try the contract:

1. Open [Remix IDE](https://remix.ethereum.org/).
2. Create a file named `BondokWeb3.sol` and paste in the contract, or upload the file from this repository.
3. Open the **Solidity Compiler** tab.
4. Select compiler version `0.8.31` or a newer compatible `0.8.x` version that satisfies `^0.8.31`.
5. Enable **Auto compile**, or click **Compile BondokWeb3.sol**.
6. Open **Deploy & Run Transactions**.
7. Select the environment you want:
   - `Remix VM` for quick local experiments.
   - `Injected Provider - MetaMask` for a testnet or mainnet deployment.
8. Select `BondokWeb3` and click **Deploy**.
9. Confirm the transaction in your wallet.
10. Save the deployed contract address. You will need it to interact with the contract from an application or block explorer.

> Before deploying to a live network, verify the selected network, wallet account, and gas settings. Test on a testnet first and review all Remix warnings.

## Usage

### Minting a New NFT

After deploying the contract:

1. Prepare a metadata file in JSON format.
2. Upload the JSON file and its image to IPFS or another reliable storage service.
3. Obtain the JSON URI, preferably in this format:

   ```text
   ipfs://<metadata-cid>
   ```

4. Call `mintNFT` with the JSON URI.
5. Wait for the transaction to be confirmed. The NFT will belong to the address that sent the transaction.
6. Call `tokenURI(tokenId)` to verify the stored URI.

Example:

```text
mintNFT("ipfs://bafybe.../metadata.json")
```

If this is the first successful mint, the returned token ID will be `0`. The next successful mint will be `1`, and so on.

### Reading Token Data

After obtaining a token ID:

```text
ownerOf(0)    -> current owner address
tokenURI(0)   -> stored metadata URI
```

You can use a block explorer's **Read Contract** tab to call these functions, or call them from a JavaScript application.

## Metadata Format

[`nft-metadata.json`](./nft-metadata.json) contains a simple example:

```json
{
  "name": "Bondok Web3 #1",
  "description": "NFT for Bondok Web3 #2",
  "image": "ipfs://<image-cid>",
  "attributes": [
    {
      "trait_type": "category",
      "value": "Blockchain"
    },
    {
      "trait_type": "level",
      "value": "Beginner"
    }
  ]
}
```

Important guidelines:

- Prefer `ipfs://` or `ar://` URIs over centralized gateway URLs whenever possible.
- `jsonUri` must point to the **metadata JSON file**, not directly to the image.
- The `image` field should point to the image itself.
- Validate the JSON before uploading it.
- Make sure the filename, CID, and URI passed to `mintNFT` all match.
- IPFS content is content-addressed when using a CID, but the gateway used to access it can vary.
- The current metadata file uses an HTTPS Pinata gateway URL in its `image` field. It can be replaced with an `ipfs://...` URI for better portability between marketplaces.

## JavaScript and ethers Integration

After installing `ethers` and providing the contract address and ABI, you can mint as follows:

```js
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const abi = [
  "function mintNFT(string jsonUri) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const contract = new ethers.Contract(
  "0xYOUR_CONTRACT_ADDRESS",
  abi,
  signer
);

const metadataUri = "ipfs://YOUR_METADATA_CID/metadata.json";
const transaction = await contract.mintNFT(metadataUri);
const receipt = await transaction.wait();

console.log("Mint transaction:", receipt.hash);
console.log("Metadata URI:", await contract.tokenURI(0));
```

Notes:

- The Solidity function declares `returns (uint256)`, but a transaction's return value is not normally exposed directly to a frontend. To obtain the token ID before sending, use `staticCall`, or read the ERC-721 `Transfer` event from the receipt.
- Do not assume that every mint has token ID `0`. Read the event or derive the ID from the contract state.
- Use the correct contract address and RPC network. Never place private keys or secrets in frontend code or in the repository.

Example of reading the expected token ID before sending the transaction with ethers v6:

```js
const nextTokenId = await contract.mintNFT.staticCall(metadataUri);
const transaction = await contract.mintNFT(metadataUri);
await transaction.wait();

console.log("Minted token:", nextTokenId.toString());
```

## Workflow

```text
Create metadata and an image
            │
            ▼
Upload files to IPFS / Arweave
            │
            ▼
Obtain the metadata JSON URI
            │
            ▼
The user calls mintNFT(jsonUri)
            │
            ▼
A token ID is created and assigned to msg.sender
            │
            ▼
The tokenURI is stored for the NFT
            │
            ▼
The marketplace or application reads the metadata and displays the image
```

## Security Considerations and Limitations

This contract is intentionally simple and useful for learning, but the following design decisions must be understood before using it in a real project:

1. **Minting is public:** There is no owner, allowlist, or whitelist signature. Any address can mint an unlimited number of NFTs.
2. **There is no mint price:** The function is not `payable` and does not collect ETH or another currency. The caller only pays gas.
3. **There is no maximum supply:** The contract has no `maxSupply` or pause mechanism.
4. **There are no royalties:** The contract does not implement EIP-2981.
5. **The URI is user-supplied:** The contract does not verify that `jsonUri` is valid or points to JSON. An empty or invalid URI can be supplied.
6. **Metadata is off-chain:** The contract stores only the URI. Losing the metadata or image from the hosting service can affect how the NFT is displayed.
7. **The dependency import is not pinned:** The contract imports OpenZeppelin's `master` branch. Future changes to the remote source can affect reproducibility or compatibility.
8. **No tests are included:** Unit and integration tests should be added before relying on the contract.
9. **The contract is not upgradeable:** After deployment, its logic cannot be updated through a proxy mechanism. Review the code before deployment.
10. **There is no delegated minting:** The function always mints to `msg.sender`. Minting to another address would require a different, carefully tested design.

> These are not necessarily bugs in a learning example, but they are important constraints that should not be hidden when moving toward production use.

## Preparing a Production Version

Before using this project in production, consider the following:

- Pin OpenZeppelin to a specific version instead of importing from `master`.
- Use a dependency manager such as npm with Hardhat, or Foundry.
- Change the imports to a locally installed dependency, for example:

  ```solidity
  import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
  import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
  ```

- Define a clear minting policy: price, maximum supply, allowlist, or authorized minters.
- Add `Pausable` if the project needs an emergency pause mechanism.
- Add custom events only when the application needs additional information; ERC-721 already emits `Transfer` during a successful mint.
- Add tests for minting, token numbering, URIs, transfers, approvals, and failure cases.
- Run static analysis tools such as Slither and conduct an independent security review.
- Use IPFS or Arweave and pin the CIDs before minting.
- Verify the deployed contract on the relevant block explorer.
- Never commit private keys or other secrets to the repository or frontend.

## Testing

There is currently no Hardhat or Foundry test setup in the repository. At minimum, the following tests should be added:

- Deploy the contract and verify the name is `Bondok Web3` and the symbol is `BW3`.
- Confirm that the first successful mint returns token ID `0`.
- Confirm that the initial owner is `msg.sender`.
- Confirm that `jsonUri` is returned by `tokenURI`.
- Perform a second mint and verify that its token ID is `1`.
- Test inherited ERC-721 transfers and approval operations.
- Test that `ownerOf` and `tokenURI` revert for a nonexistent token ID.
- Test that a reverted transaction does not consume a token ID.

## License

The contract declares the **MIT** license in the SPDX header of `BondokWeb3.sol`. Also review the licenses of OpenZeppelin and any other dependencies before redistributing or incorporating the project into a commercial product.

---

This repository is a small starting point for learning about ERC-721 tokens, NFT metadata, and minting on EVM-compatible networks.
