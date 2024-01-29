// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract Economy {
    // Array to hold addresses of deployed projects
    address[] public deployedProjects;
    uint arbitrationFee=200;
    mapping (address => uint) public earned;
    mapping (address => uint) public spent;
    // Function to deploy a new Project contract
    function createProject(string memory name, address author, address contractor, address arbiter, string memory termsHash, string memory repo) public payable {
        NativeProject newProject = new NativeProject(msg.sender, name, author, contractor, arbiter, termsHash, repo, arbitrationFee);
        deployedProjects.push(address(newProject));
    }
}


contract NativeProject {
    // state variables
    address public economy;
    string public name;
    address public author;
    address public contractor;
    address public arbiter;
    string public termsHash;
    string public repo;
    mapping (address => uint) public contributors;
    mapping (address => uint) public contributorsReleasing;
    mapping (address => uint) public contributorsDisputing;
    uint public availableToContractor;
    uint public availableToContributors;
    uint public totalVotesForRelease;
    uint public totalVotesForDispute;
    uint public totalStored;
    uint public disputeResolution;
    string public ruling_hash;
    string public stage;
    uint public arbitrationFee;
    bool public arbitrationFeePaidOut = false;
    // constructor
    constructor(
        address _economy,
        string memory _name,
        address _author,
        address _contractor,
        address _arbiter,
        string memory _termsHash,
        string memory _repo,
        uint _arbitrationFee)
        payable 
        {
        economy = _economy;
        name = _name;
        author = _author;
        contractor = _contractor;
        arbiter = _arbiter;
        termsHash = _termsHash;
        repo = _repo;
        availableToContractor = 0;
        availableToContributors = 0;
        totalVotesForRelease=0;
        totalVotesForDispute=0;
        totalStored=0;
        disputeResolution = 0;
        arbitrationFee = _arbitrationFee;
        ruling_hash = "";
        if (contractor != address (0) && arbiter != address (0)) { // check if the contractor and arbiter are assigned.
            require(msg.value >= arbitrationFee / 2, "Must stake half the arbitration fee");
            stage = "pending"; // assign "pending" to the stage variable
        } else {
            stage = "open"; // assign "open" to the stage variable
        }
    }

    function setParties(address _contractor, address _arbiter) public payable{
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("open")) || keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending")), "Can't set the parties unless the project is in 'open' or 'pending' stage.");
        require (msg.sender==author,"Only the Project's Author can set the other parties.");
        contractor=_contractor;
        arbiter=_arbiter;
        stage="pending";
    }

    function sendFunds() public payable {
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("open")) || keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending")), "Withdrawals only allowed when the project is in 'open' or 'pending' stage.");
        contributors[msg.sender] += msg.value;
        totalStored += msg.value;
    }

    function withdrawAsContributor() public {
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("open")) || keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending")) || keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("closed")), "Withdrawals only allowed when the project is in 'open', 'pending' or 'closed' stage.");
        uint256 contributorAmount = contributors[msg.sender];
        require(contributorAmount > 0, "No contributions to withdraw.");
        // Calculate the portion of the contributor based on the arbitration
        uint256 contributorShare = (contributorAmount * availableToContributors) / totalStored;
        totalStored -= contributorShare;
        contributors[msg.sender] = 0; // Prevent re-entrancy by zeroing before sending
        availableToContributors -= contributorShare; // Update the available amount for contributors
        payable(msg.sender).transfer(contributorShare);
    }

    event ContractSigned(address contractor);
     function signContract() public payable {
        // Check if the caller is the designated contractor
        require(msg.sender == contractor, "Only the designated contractor can sign the contract");
        // Check if the project is in the "pending" stage
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending")), "The project can only be signed while in `pending` stage.");
        // Update the stage to "ongoing"
        require(msg.value >= arbitrationFee / 2, "Must stake half the arbitration fee to sign the contract.");
        stage = "ongoing";
        emit ContractSigned(msg.sender);
    }

    event ProjectClosed(address by);
    function reimburse() public {
        // Ensure that only the contractor can call this function
        require(msg.sender == contractor, "Only the contractor can call this function.");
        // Check that the project is currently in the "ongoing" stage
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("ongoing")), "This action can only be performed while the project is ongoing.");
        // Move the project to "closed" mode
        stage = "closed";
        emit ProjectClosed(msg.sender);
    }

    // Function to vote for releasing payment to the contractor
    function voteToReleasePayment() public {
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("ongoing")), "Project must be ongoing to vote");
        // Directly reset dispute vote and adjust total votes
        totalVotesForDispute -= contributorsDisputing[msg.sender];
        contributorsDisputing[msg.sender] = 0;
        // Update release vote if not already voted
        if (contributorsReleasing[msg.sender] == 0) {
            totalVotesForRelease += contributors[msg.sender];
        }
        contributorsReleasing[msg.sender] = contributors[msg.sender];
        // Check if the threshold for releasing the payment is met
        if (totalVotesForRelease > address(this).balance * 70 / 100) {
            stage = "closed";
            availableToContractor = address(this).balance;
            emit ProjectClosed(msg.sender);
        }
    }

    event ProjectDisputed(address by);
    // Function to vote to dispute the project
    function voteToDispute() public {
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("ongoing")), "Project must be ongoing to vote");
        // Directly reset release vote and adjust total votes
        totalVotesForRelease -= contributorsReleasing[msg.sender];
        contributorsReleasing[msg.sender] = 0;
        // Update dispute vote if not already voted
        if (contributorsDisputing[msg.sender] == 0) {
            totalVotesForDispute += contributors[msg.sender];
        }
        contributorsDisputing[msg.sender] = contributors[msg.sender];
        // Check if the threshold for disputing the project is met
        if (totalVotesForDispute > address(this).balance * 70 / 100) {
            stage = "dispute";
            emit ProjectDisputed(msg.sender);
        }
    }

    function disputeAsContractor() public {
        require(msg.sender == contractor, "Only the designated Contractor can call this function");
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("ongoing")), "This can only be called while the project is ongoing");
        stage = "dispute";
        emit ProjectDisputed(msg.sender);
    }

    function arbitrate(uint256 percent, string memory rulingHash) public {
        require(msg.sender == arbiter, "Only the Arbiter can call this function");
        require(percent <= 100, "Resolution needs to be a number between 0 and 100");
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("dispute")), "Arbitration can only occur if the project is in dispute.");
        availableToContractor = (totalStored * percent) / 100;
        availableToContributors = totalStored - availableToContractor;
        ruling_hash = rulingHash;
        payable(arbiter).transfer(arbitrationFee);
        arbitrationFeePaidOut = true;
        stage = "closed";
        emit ProjectClosed(msg.sender);
    }
}
