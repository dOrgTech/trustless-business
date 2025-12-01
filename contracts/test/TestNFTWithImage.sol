// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract TestNFTWithImage is ERC721 {
    using Strings for uint256;

    uint256 private _tokenIdCounter;

    // Different colors for variety
    string[5] private colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"];
    string[5] private names = ["Ruby", "Teal", "Sky", "Mint", "Gold"];

    constructor() ERC721("Test NFT Collection", "TNFTC") {
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

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        uint256 colorIndex = tokenId % 5;
        string memory color = colors[colorIndex];
        string memory name = names[colorIndex];

        // Generate SVG image
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">',
            '<rect width="400" height="400" fill="', color, '"/>',
            '<circle cx="200" cy="160" r="80" fill="white" opacity="0.3"/>',
            '<text x="200" y="280" font-family="Arial" font-size="48" fill="white" text-anchor="middle">',
            '#', tokenId.toString(),
            '</text>',
            '<text x="200" y="340" font-family="Arial" font-size="24" fill="white" text-anchor="middle">',
            name,
            '</text>',
            '</svg>'
        ));

        string memory imageURI = string(abi.encodePacked(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(svg))
        ));

        // Generate JSON metadata
        string memory json = string(abi.encodePacked(
            '{"name": "Test NFT #', tokenId.toString(),
            '", "description": "A test NFT for DAO treasury testing", ',
            '"image": "', imageURI,
            '", "attributes": [{"trait_type": "Color", "value": "', name, '"}]}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }
}
