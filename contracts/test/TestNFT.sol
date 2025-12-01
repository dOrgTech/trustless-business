// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestNFT is ERC721 {
    uint256 private _tokenIdCounter;

    constructor() ERC721("Test NFT", "TNFT") {
        // Mint first 3 NFTs to deployer
        for (uint256 i = 0; i < 3; i++) {
            _mint(msg.sender, _tokenIdCounter);
            _tokenIdCounter++;
        }
    }

    function mint(address to) public {
        _mint(to, _tokenIdCounter);
        _tokenIdCounter++;
    }
}
