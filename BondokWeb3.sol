//SPDX-License-Identifier:MIT
pragma solidity ^0.8.31;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/ERC721.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract BondokWeb3 is ERC721URIStorage {

    uint256 private _tokenId;

    constructor() ERC721("Bondok Web3","BW3") {}

    function mintNFT(string memory jsonUri) public returns(uint256) {

        uint256 newTokenId = _tokenId;
        _mint(msg.sender, newTokenId);
        _setTokenURI(newTokenId,jsonUri);
        _tokenId++;
        return newTokenId ;

    }
}