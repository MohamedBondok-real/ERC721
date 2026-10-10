# BondokWeb3 — NFT Smart Contract

A simple ERC-721 Non-Fungible Token (NFT) smart contract built with Solidity and OpenZeppelin.

## Overview

BondokWeb3 is an NFT smart contract that allows users to mint unique NFTs and associate each token with a metadata URI.

The contract inherits from OpenZeppelin's `ERC721URIStorage`, providing ERC-721 functionality, token ownership management, and per-token URI storage.

* **Token Name:** Bondok Web3
* **Token Symbol:** BW3
* **Standard:** ERC-721
* **Solidity Version:** ^0.8.31
* **Library:** OpenZeppelin Contracts

## Features

* **NFT Minting:** Users can mint new NFTs by calling `mintNFT()`.
* **Unique Token IDs:** Each newly minted NFT receives an incrementing token ID, starting from `0`.
* **Metadata URI:** Each NFT is assigned a URI that references its metadata.
* **Ownership Tracking:** Token ownership is managed through the ERC-721 standard.
* **OpenZeppelin Integration:** Uses established ERC-721 implementations instead of implementing the standard from scratch.

## How It Works

1. Deploy the `BondokWeb3` contract.
2. Call `mintNFT(string memory jsonUri)` with a metadata URI.
3. The contract mints a new NFT to the caller's address.
4. The provided URI is stored for that token.
5. The token ID increments for the next mint.

## Main Function

### `mintNFT(string memory jsonUri)`

Mints a new NFT to `msg.sender` and associates it with the supplied metadata URI.

**Parameter:**

* `jsonUri`: URI pointing to the NFT's metadata, typically a JSON document containing information such as its name, description, and image.

**Returns:**

* `uint256`: The ID assigned to the newly minted NFT.

## Example

```solidity
string memory metadataURI = "ipfs://YOUR_METADATA_CID/metadata.json";
uint256 tokenId = nft.mintNFT(metadataURI);
```

Replace the example URI with a valid metadata URI. The contract does not upload metadata files; it stores the URI provided by the caller.

## Project Structure

```text
.
├── src/
│   └── BondokWeb3.sol
└── README.md
```

The structure above is illustrative; adjust it to match the actual repository.

## Security Considerations

* The current contract allows any address to mint NFTs without a supply limit.
* The contract does not validate the supplied metadata URI.
* Metadata availability and integrity depend on the URI's storage location and hosting system.
* The contract has not been audited.

## Future Improvements

* Add automated tests for minting, ownership, token IDs, and metadata URIs.
* Consider access control or a maximum supply if required by the project.
* Add deployment scripts and usage instructions.
* Pin the OpenZeppelin dependency to a specific version for reproducible builds.

## Disclaimer

This project is intended for educational purposes and Solidity development practice. It has not been audited and should not be used in production without appropriate testing and security review.

## License

MIT

```
```
