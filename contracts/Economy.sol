// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IEconomy.sol";
import "./NativeProject.sol";
import "./ERC20Project.sol";

contract Economy is IEconomy {
    address public nativeProjectImplementation;
    address public erc20ProjectImplementation;

    address[] public deployedProjects;
    address payable admin;
    mapping(address => bool) public isProjectContract;
    uint public arbitrationFee = 1 ether;

    mapping(address => address[]) public projectsAsAuthor;
    mapping(address => address[]) public projectsAsContractor;
    mapping(address => address[]) public projectsAsArbiter;

    mapping(address => uint) public nativeEarned;
    mapping(address => uint) public nativeSpent;
    mapping(address => uint) public usdtEarned;
    mapping(address => uint) public usdtSpent;

    constructor() {
        admin = payable(msg.sender);
    }

    function setImplementations(address _native, address _erc20) external {
        require(msg.sender == admin, "Only admin can set implementations.");
        nativeProjectImplementation = _native;
        erc20ProjectImplementation = _erc20;
    }

    event InboundValue();
    event NewProject(address indexed contractAddress, string projectName, address contractor, address arbiter, string termsHash, string repo, string description, address token);

    fallback() external payable { emit InboundValue(); }
    receive() external payable { emit InboundValue(); }

    function getNumberOfProjects() public view returns (uint) { return deployedProjects.length; }

    function getUserRep(address userAddress) public view returns (uint, uint, uint, uint) {
        return (nativeEarned[userAddress], nativeSpent[userAddress], usdtEarned[userAddress], usdtSpent[userAddress]);
    }
    
    function getUserProfile(address userAddress) 
        public 
        view 
        returns (address[] memory, address[] memory, address[] memory) 
    {
        return (
            projectsAsAuthor[userAddress],
            projectsAsContractor[userAddress],
            projectsAsArbiter[userAddress]
        );
    }

    function createProject(
        string memory name,
        address contractor,
        address arbiter,
        string memory termsHash,
        string memory repo,
        string memory description
    ) public payable {
        require(nativeProjectImplementation != address(0), "Native implementation not set.");
        address payable clone = payable(Clones.clone(nativeProjectImplementation));
        
        // --- CORRECTED LOGIC ---
        // 1. Register the project address first.
        deployedProjects.push(clone);
        isProjectContract[clone] = true;

        // 2. Now initialize it. The callback will succeed.
        NativeProject(clone).initialize{value: msg.value}(
            payable(address(this)), name, msg.sender, contractor, arbiter, 
            termsHash, repo, arbitrationFee
        );
        
        emit NewProject(clone, name, contractor, arbiter, termsHash, repo, description, address(0));
    }

    function createERC20Project(
        string memory name,
        address contractor,
        address arbiter,
        string memory termsHash,
        string memory repo,
        string memory description,
        address tokenAddress,
        uint tokenArbitrationFee
    ) public {
        require(erc20ProjectImplementation != address(0), "ERC20 implementation not set.");
        address clone = Clones.clone(erc20ProjectImplementation);
        
        // --- CORRECTED LOGIC ---
        // 1. Register the project address first.
        deployedProjects.push(clone);
        isProjectContract[clone] = true;

        // 2. Now initialize it. The callback will succeed.
        ERC20Project(clone).initialize(
            payable(address(this)), tokenAddress, name, msg.sender, contractor, arbiter,
            termsHash, repo, tokenArbitrationFee
        );

        if (contractor != address(0) && arbiter != address(0)) {
            uint feeStake = tokenArbitrationFee / 2;
            IERC20(tokenAddress).transferFrom(msg.sender, clone, feeStake);
        }
        
        emit NewProject(clone, name, contractor, arbiter, termsHash, repo, description, tokenAddress);
    }

    function updateEarnings(address user, uint amount, bool native) external override {
        require(isProjectContract[msg.sender], "Only Project contracts can call this function.");
        if (native) { nativeEarned[user] += amount; } else { usdtEarned[user] += amount; }
    }

    function updateSpendings(address user, uint amount, bool native) external override {
        require(isProjectContract[msg.sender], "Only Project contracts can call this function.");
        if (native) { nativeSpent[user] += amount; } else { usdtSpent[user] += amount; }
    }
    
    function registerProjectRoles(address projectAddress, address author, address contractor, address arbiter) external override {
        require(isProjectContract[msg.sender], "Only Project contracts can call this function.");
        require(msg.sender == projectAddress, "Project can only register its own roles.");

        if (author != address(0)) {
            projectsAsAuthor[author].push(projectAddress);
        }
        if (contractor != address(0)) {
            projectsAsContractor[contractor].push(projectAddress);
        }
        if (arbiter != address(0)) {
            projectsAsArbiter[arbiter].push(projectAddress);
        }
    }

    function withdrawNative() public {
        require(msg.sender == admin, "Only the contract owner can withdraw Ether");
        payable(msg.sender).transfer(address(this).balance);
    }

    function withdrawTokens(address tokenAddress) public {
        require(msg.sender == admin, "Only the admin can withdraw tokens.");
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw.");
        require(token.transfer(admin, balance), "Token withdrawal failed.");
    }
}
// Economy.sol