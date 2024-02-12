// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract Economy {
    // Array to hold addresses of deployed projects
    address[] public deployedProjects;
    mapping(address => bool) public isProjectContract;
    uint public arbitrationFee=200;
    mapping (address => uint) public earned;
    mapping (address => uint) public spent;
    // Function to deploy a new Project contract
    function getNumberOfProjects() public view returns (uint) {
        return deployedProjects.length;
    }

    function createProject(
    string memory name, 
    address contractor,
    address arbiter, 
    string memory termsHash,
    string memory repo
    // Make sure to pass the arbitration fee as an argument if it's not a fixed value in the Economy contract
    ) public payable {
    NativeProject newProject;
    if (contractor != address(0) && arbiter != address(0)) {
        // If both contractor and arbiter are specified, the project will be in "pending" stage
        // and require staking half the arbitration fee.
        require(msg.value >= arbitrationFee / 2, "Insufficient funds to cover the arbitration fee.");
        newProject = (new NativeProject){value: msg.value}(
            address(this),name,msg.sender,contractor,arbiter,termsHash,repo,arbitrationFee
        );
    } else {
        // If the contractor is not specified, the project is in "open" stage
        newProject = new NativeProject(address(this),
            name, msg.sender, address(0), address(0), termsHash, repo, arbitrationFee
            );
        }
        deployedProjects.push(address(newProject));
        isProjectContract[address(newProject)] = true;
    }

    function updateEarnings(address user, uint amount) external {
        require(isProjectContract[msg.sender], "Only authorized Project contracts can call this function.");
        earned[user] += amount;
    }

    function updateSpendings(address user, uint amount) external {
        require(isProjectContract[msg.sender], "Only authorized Project contracts can call this function.");
        spent[user] += amount;
    }

}


contract NativeProject {
    // state variables
    Economy public economy;
    string public name;
    address public author;
    address public contractor;
    address public arbiter;
    string public termsHash;
    string public repo;
    bool reimbursement;
    mapping (address => uint) public contributors;
    mapping (address => uint) public contributorsReleasing;
    mapping (address => uint) public contributorsDisputing;
    uint public availableToContractor;
    uint public availableToContributors;
    uint public totalVotesForRelease;
    uint public totalVotesForDispute;
    uint public projectValue;
    uint public disputeResolution;
    string public ruling_hash;
    string public stage;
    uint public arbitrationFee;
    bool public arbitrationFeePaidOut = false;
    bool public contractorWithdrawnArbitrationFee = false;
    bool public authorWithdrawnArbitrationFee = false;
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
        economy = Economy(address(_economy));
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
        projectValue=0;
        disputeResolution = 0;
        arbitrationFee = _arbitrationFee;
        ruling_hash = "";
        if (contractor != address (0) && arbiter != address (0)) { // check if the contractor and arbiter are assigned.
            require(msg.value >= arbitrationFee / 2, "Must stake half of the arbitration fee");
            stage = "pending"; // assign "pending" to the stage variable
        } else {
            stage = "open"; // assign "open" to the stage variable
        }
    }

    function setParties(address _contractor, address _arbiter, string memory _termsHash) public payable{
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("open")) || 
        keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending")), 
        "Parties can be set only in 'open' or 'pending' stage.");
        require (msg.sender==author,"Only the Project's Author can set the other parties.");
        require(msg.value >= arbitrationFee / 2, "Must stake half the arbitration fee to sign the contract.");
        contractor=_contractor;
        arbiter=_arbiter;
        termsHash=_termsHash;
        stage="pending";
    }


    function sendFunds() public payable {
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("open")) ||
         keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending")),
          "Funding is only allowed when the project is in 'open' or 'pending' stage.");
        contributors[msg.sender] += msg.value;
        projectValue += msg.value;
    }

    event ContractorPaid(address contractor);
    function withdrawAsContractor() public {
        require(
            keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("closed")) ,
            "The contractor can only withdraw once the project is closed.");

        require(msg.sender == contractor, "Only the contractor can withdraw.");

        uint256 amountToWithdraw = availableToContractor;
        availableToContractor = 0; // Prevent re-entrancy by zeroing before transfer

        (bool sent, ) = payable(contractor).call{value: amountToWithdraw}("");
        economy.updateEarnings(contractor, amountToWithdraw);
        require(sent, "Failed to send Ether to contractor.");
        emit ContractorPaid(contractor);
    }

    function updateContributorSpendings()public{
        require(
            keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("closed")) ,
            "Stats for the contributor can be updated once the project is closed.");
        uint expenditure=contributors[msg.sender];
        contributors[msg.sender]=0;
        economy.updateSpendings(msg.sender,expenditure);
    }

    function reclaimArbitrationFee()public{
        require(
            keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("closed")) ,
            "Arbitration fee can be reclaimed once the project is closed.");
        require (arbitrationFeePaidOut==false, "The fee has been paid out to the Arbiter (because there was a dispute).");
        require (msg.sender==author||msg.sender==contractor, "Arbitration fee can only be returned to the parties that stakes it");
        if (msg.sender==author){
            require(authorWithdrawnArbitrationFee==false, "You have already claimed this back.");
            authorWithdrawnArbitrationFee=true;
            uint amountToWithdraw=arbitrationFee/2;
            (bool sent, ) = payable(contractor).call{value: amountToWithdraw}("");
            require(sent, "Failed to withdraw.");
        }
        if (msg.sender==contractor){
            require(contractorWithdrawnArbitrationFee==false, "You have already claimed this back.");
            contractorWithdrawnArbitrationFee=true;
            uint amountToWithdraw=arbitrationFee/2;
            (bool sent, ) = payable(contractor).call{value: amountToWithdraw}("");
            require(sent, "Failed to withdraw.");
        }
    }


    function withdrawAsContributor() public {
        require(
            keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("open"))||
            keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("pending"))||
            keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("closed")) ,
         "Withdrawals only allowed when the project is open, pending or closed.");

        uint256 contributorAmount = contributors[msg.sender];
        require(contributorAmount > 0, "No contributions to withdraw.");      
        uint256 exitAmount;
        if (disputeResolution>0){
            exitAmount = (contributorAmount * availableToContributors) / projectValue;
            uint expenditure=contributorAmount-exitAmount;
            economy.updateSpendings(msg.sender,expenditure);
        }else{
            exitAmount = contributorAmount;
        }
        contributors[msg.sender] = 0; // Prevent re-entrancy
        (bool sent, ) = payable(msg.sender).call{value: exitAmount}("");
        require(sent, "Failed to send Ether");
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
            availableToContractor = projectValue;
            availableToContributors=0;
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
        require(percent >= 0 && percent <= 100, "Resolution needs to be a number between 0 and 100");
        require(keccak256(abi.encodePacked(stage)) == keccak256(abi.encodePacked("dispute")), "Arbitration can only occur if the project is in dispute.");
        availableToContractor = (projectValue * percent) / 100;
        availableToContributors = projectValue - availableToContractor;
        disputeResolution=percent;
        ruling_hash = rulingHash;
        payable(arbiter).transfer(arbitrationFee);
        arbitrationFeePaidOut = true;
        stage = "closed";
        economy.updateEarnings(arbiter, arbitrationFee);
        emit ProjectClosed(msg.sender);
    }
}
