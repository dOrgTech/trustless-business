// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IEconomy.sol";
import "./IGovernedEconomy.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract NativeProject is Initializable {
    IEconomy public economy;
    uint public coolingOffPeriodEnds;
    uint public disputeStarted;
    string public name;
    address public author;
    address public contractor;
    address public arbiter;
    string public termsHash;
    string public repo;
    address[] public backers;
    mapping(address => uint) public contributors;
    mapping(address => uint) public contributorsReleasing;
    mapping(address => uint) public contributorsDisputing;
    uint public availableToContractor;
    uint public totalVotesForRelease;
    uint public totalVotesForDispute;
    uint public projectValue;
    uint public disputeResolution;
    string public ruling_hash;
    bool public fundsReleased;
    uint public arbitrationFee;
    bool public arbitrationFeePaidOut = false;
    bool public contractorWithdrawnArbitrationFee = false;
    bool public authorWithdrawnArbitrationFee = false;

    address public daoTimelock;
    address public daoGovernor;

    enum Stage { Open, Pending, Ongoing, Dispute, Closed }
    Stage public stage;

    struct ProjectDetails {
        string name;
        address author;
        address contractor;
        address arbiter;
        Stage stage;
        uint projectValue;
        uint totalVotesForRelease;
        uint totalVotesForDispute;
        uint availableToContractor;
        uint arbitrationFee;
        bool fundsReleased;
    }

    uint256 public constant ARBITRATION_TIMEOUT = 150 days;

    event SetParties(address _contractor, address _arbiter, string _termsHash);
    event SendFunds(address who, uint256 howMuch);
    event ContractorPaid(address contractor, uint256 amount);
    event ContributorWithdrawn(address contributor, uint256 amount);
    event ProjectDisputed(address by);
    event ProjectClosed(address by);
    event ContractSigned(address contractor);
    event ArbitrationDecision(address arbiter, uint256 percent, string rulingHash);
    event AuthorPaid(address author, uint256 amount);
    event VetoedByDao(address indexed timelock);

    function initialize(
        address payable _economy,
        string memory _name,
        address _author,
        address _contractor,
        address _arbiter,
        string memory _termsHash,
        string memory _repo,
        address _daoTimelock,
        address _daoGovernor
    ) public payable initializer {
        economy = IEconomy(_economy);
        fundsReleased = false;
        name = _name;
        author = _author;
        contractor = _contractor;
        arbiter = _arbiter;
        termsHash = _termsHash;
        repo = _repo;
        
        daoTimelock = _daoTimelock;
        daoGovernor = _daoGovernor;

        arbitrationFee = IGovernedEconomy(_economy).nativeArbitrationFee();

        economy.registerProjectRoles(address(this), _author, _contractor, _arbiter);

        if (contractor != address(0) && arbiter != address(0)) {
            require(msg.value >= arbitrationFee / 2, "Must stake half of the arbitration fee");
            stage = Stage.Pending;
        } else {
            stage = Stage.Open;
        }
    }
    
    function getProjectDetails() public view returns (ProjectDetails memory) {
        return ProjectDetails({
            name: name,
            author: author,
            contractor: contractor,
            arbiter: arbiter,
            stage: stage,
            projectValue: projectValue,
            totalVotesForRelease: totalVotesForRelease,
            totalVotesForDispute: totalVotesForDispute,
            availableToContractor: availableToContractor,
            arbitrationFee: arbitrationFee,
            fundsReleased: fundsReleased
        });
    }

    function arbitrationPeriodExpired() public {
        require(stage == Stage.Dispute, "Project must be in dispute stage");
        require(
            block.timestamp >= disputeStarted + ARBITRATION_TIMEOUT,
            "Arbitration period has not expired yet"
        );
        stage = Stage.Closed;
        emit ProjectClosed(msg.sender);
    }

    function setParties(address _contractor, address _arbiter, string memory _termsHash) public payable {
        require(stage == Stage.Open, "Parties can only be set in 'open' stage.");
        require(msg.sender == author, "Only the Project's Author can set the other parties.");
        require(_contractor != address(0) && _arbiter != address(0), "Contractor and arbiter addresses must be valid.");
        
        arbitrationFee = IGovernedEconomy(address(economy)).nativeArbitrationFee();
        require(msg.value >= arbitrationFee / 2, "Must stake half of the arbitration fee.");

        coolingOffPeriodEnds = block.timestamp + IGovernedEconomy(address(economy)).coolingOffPeriod();
        contractor = _contractor;
        arbiter = _arbiter;
        termsHash = _termsHash;
        
        economy.registerProjectRoles(address(this), address(0), _contractor, _arbiter);

        emit SetParties(_contractor, _arbiter, _termsHash);
        stage = Stage.Pending;
    }

    function sendFunds() public payable {
        require(
            stage == Stage.Open || stage == Stage.Pending,
            "Funding is only allowed when the project is in 'open' or 'pending' stage."
        );
        if (contributors[msg.sender] == 0) {
            backers.push(msg.sender);
        }
        contributors[msg.sender] += msg.value;
        projectValue += msg.value;
        emit SendFunds(msg.sender, msg.value);
    }

    function signContract() public payable {
        require(msg.sender == contractor, "Only the designated contractor can sign the contract");
        require(stage == Stage.Pending, "The project can only be signed while in `pending` stage.");
        require(block.timestamp > coolingOffPeriodEnds, "Contract signing is blocked during the cooling-off period.");
        require(msg.value >= arbitrationFee / 2, "Must stake half the arbitration fee to sign the contract.");
        require(projectValue > 0, "Can't sign a contract with no funds in it.");
        stage = Stage.Ongoing;
        emit ContractSigned(msg.sender);
    }

    function voteToReleasePayment() public {
        require(stage == Stage.Ongoing, "Project must be ongoing to vote");
        uint contributorAmount = contributors[msg.sender];
        require(contributorAmount > 0, "Only contributors can vote");

        if (contributorsDisputing[msg.sender] > 0) {
            totalVotesForDispute -= contributorsDisputing[msg.sender];
            contributorsDisputing[msg.sender] = 0;
        }
        if (contributorsReleasing[msg.sender] == 0) {
            totalVotesForRelease += contributorAmount;
            contributorsReleasing[msg.sender] = contributorAmount;
        }

        uint quorumBps = IGovernedEconomy(address(economy)).backersVoteQuorumBps();
        if (totalVotesForRelease * 10000 >= projectValue * quorumBps) {
            stage = Stage.Closed;
            availableToContractor = projectValue;
            fundsReleased = true;
            emit ProjectClosed(msg.sender);
        }
    }

    function voteToDispute() public {
        require(stage == Stage.Ongoing, "Project must be ongoing to vote");
        uint contributorAmount = contributors[msg.sender];
        require(contributorAmount > 0, "Only contributors can vote");

        if (contributorsReleasing[msg.sender] > 0) {
            totalVotesForRelease -= contributorsReleasing[msg.sender];
            contributorsReleasing[msg.sender] = 0;
        }
        if (contributorsDisputing[msg.sender] == 0) {
            totalVotesForDispute += contributorAmount;
            contributorsDisputing[msg.sender] = contributorAmount;
        }

        uint quorumBps = IGovernedEconomy(address(economy)).backersVoteQuorumBps();
        if (totalVotesForDispute * 10000 >= projectValue * quorumBps) {
            stage = Stage.Dispute;
            disputeStarted = block.timestamp;
            emit ProjectDisputed(msg.sender);
        }
    }
    
    function disputeAsContractor() public {
        require(msg.sender == contractor, "Only the designated Contractor can call this function");
        require(stage == Stage.Ongoing, "This can only be called while the project is ongoing");
        stage = Stage.Dispute;
        disputeStarted = block.timestamp;
        emit ProjectDisputed(msg.sender);
    }

    function reimburse() public {
        require(msg.sender == contractor, "Only the contractor can call this function.");
        require(stage == Stage.Ongoing, "This action can only be performed while the project is ongoing.");
        stage = Stage.Closed;
        emit ProjectClosed(msg.sender);
    }

    function arbitrate(uint256 percent, string memory rulingHash) public {
        require(stage == Stage.Dispute, "Arbitration can only occur if the project is in dispute.");
        require(msg.sender == arbiter, "Only the Arbiter can call this function");
        require(percent <= 100, "Resolution needs to be a number between 0 and 100");

        availableToContractor = (projectValue * percent) / 100;
        disputeResolution = percent;
        ruling_hash = rulingHash;
        arbitrationFeePaidOut = true;
        stage = Stage.Closed;

        (bool sentArbiter, ) = payable(arbiter).call{value: arbitrationFee}("");
        require(sentArbiter, "Failed to send arbitration fee to arbiter");
        
        economy.updateEarnings(arbiter, arbitrationFee, economy.NATIVE_CURRENCY());
        emit ArbitrationDecision(msg.sender, percent, rulingHash);
        emit ProjectClosed(msg.sender);
    }

    function withdrawAsContractor() public {
        require(stage == Stage.Closed, "The contractor can only withdraw once the project is closed.");
        require(msg.sender == contractor, "Only the contractor can withdraw.");
        
        uint256 amountToPay = availableToContractor;
        require(amountToPay > 0, "Nothing to withdraw");
        availableToContractor = 0;

        IGovernedEconomy governedEconomy = IGovernedEconomy(address(economy));
        uint platformFee = (amountToPay * governedEconomy.platformFeeBps()) / 10000;
        uint256 remainder = amountToPay - platformFee;
        uint authorFee = (remainder * governedEconomy.authorFeeBps()) / 10000;
        uint256 amountToWithdraw = remainder - authorFee;

        address nativeCurrency = economy.NATIVE_CURRENCY();
        economy.updateEarnings(contractor, amountToWithdraw, nativeCurrency);
        if (authorFee > 0) {
            economy.updateEarnings(author, authorFee, nativeCurrency);
            (bool sentAuthor, ) = payable(author).call{value: authorFee}("");
            require(sentAuthor, "Failed to send Ether to author");
            emit AuthorPaid(author, authorFee);
        }
        
        if (amountToWithdraw > 0) {
            (bool sentContractor, ) = payable(contractor).call{value: amountToWithdraw}("");
            require(sentContractor, "Failed to send Ether to contractor");
        }

        if (platformFee > 0) {
            (bool sentEconomy, ) = payable(address(economy)).call{value: platformFee}("");
            require(sentEconomy, "Failed to send platform fee");
        }

        emit ContractorPaid(contractor, amountToWithdraw);
    }

    function withdrawAsContributor() public {
        require(stage == Stage.Open || stage == Stage.Pending || stage == Stage.Closed, "Withdrawals only allowed when the project is open, pending or closed.");

        uint256 contributorAmount = contributors[msg.sender];
        require(contributorAmount > 0, "No contributions to withdraw.");
        contributors[msg.sender] = 0;
        
        uint256 exitAmount = (contributorAmount * (100 - disputeResolution)) / 100;
        uint256 expenditure = contributorAmount - exitAmount;
        projectValue -= exitAmount;
        
        if (expenditure > 0) {
            economy.updateSpendings(msg.sender, expenditure, economy.NATIVE_CURRENCY());
        }
        
        if (exitAmount > 0) {
            (bool sent, ) = payable(msg.sender).call{value: exitAmount}("");
            require(sent, "Failed to send Ether");
        }

        emit ContributorWithdrawn(msg.sender, exitAmount);
    }
    
    function reclaimArbitrationFee() public {
        require(stage == Stage.Closed, "Arbitration fee can be reclaimed once the project is closed.");
        require(arbitrationFeePaidOut == false, "The fee has been paid out to the Arbiter (because there was a dispute).");
        require(msg.sender == author || msg.sender == contractor, "Arbitration fee can only be returned to the parties.");
        
        uint amountToWithdraw = arbitrationFee / 2;

        if (msg.sender == author) {
            require(authorWithdrawnArbitrationFee == false, "You have already claimed this back.");
            authorWithdrawnArbitrationFee = true;
            (bool sent, ) = payable(author).call{value: amountToWithdraw}("");
            require(sent, "Failed to withdraw.");
        } else {
            require(contractorWithdrawnArbitrationFee == false, "You have already claimed this back.");
            contractorWithdrawnArbitrationFee = true;
            (bool sent, ) = payable(contractor).call{value: amountToWithdraw}("");
            require(sent, "Failed to withdraw.");
        }
    }
    
    function daoVeto() public {
        require(msg.sender == daoTimelock, "Only the DAO Timelock can veto a project.");
        require(stage != Stage.Closed, "Cannot veto a closed project.");
        stage = Stage.Closed;
        // FIXED: Sets disputeResolution to 0 to ensure 100% refund to backers.
        disputeResolution = 0;
        emit VetoedByDao(msg.sender);
    }
}
// NativeProject.sol```

