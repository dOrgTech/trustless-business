// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IEconomy.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract NativeProject is Initializable {
    IEconomy public economy;
    uint public coolingOffPeriodEnds;
    uint public disputeStarted;
    string public name;
    address public author;
    address public contractor;
    address public admin;
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

    enum Stage {
        Open,
        Pending,
        Ongoing,
        Dispute,
        Closed
    }
    Stage public stage;

    // --- NEW STRUCT DEFINITION ---
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

    uint256 public constant COOLING_OFF_PERIOD = 2 minutes;
    uint256 public constant ARBITRATION_TIMEOUT = 150 days;

    // Events
    event SetParties(address _contractor, address _arbiter, string _termsHash);
    event SendFunds(address who, uint256 howMuch);
    event ContractorPaid(address contractor, uint256 amount);
    event ContributorWithdrawn(address contributor, uint256 amount);
    event ProjectDisputed(address by);
    event ProjectClosed(address by);
    event ContractSigned(address contractor);
    event ArbitrationDecision(address arbiter, uint256 percent, string rulingHash);
    event AuthorPaid(address author, uint256 amount);

    function initialize(
        address payable _economy,
        string memory _name,
        address _author,
        address _contractor,
        address _arbiter,
        string memory _termsHash,
        string memory _repo,
        uint _arbitrationFee
    ) public payable initializer {
        economy = IEconomy(_economy);
        fundsReleased = false;
        name = _name;
        author = _author;
        contractor = _contractor;
        arbiter = _arbiter;
        termsHash = _termsHash;
        repo = _repo;
        arbitrationFee = _arbitrationFee;
        ruling_hash = "";

        if (contractor != address(0) && arbiter != address(0)) {
            require(
                msg.value >= arbitrationFee / 2,
                "Must stake half of the arbitration fee"
            );
            stage = Stage.Pending;
        } else {
            stage = Stage.Open;
        }
    }
    
    // --- NEW GETTER FUNCTION ---
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

    // --- All other functions remain exactly the same ---
    
    function arbitrationPeriodExpired() public {
        require(stage == Stage.Dispute, "Project must be in dispute stage");
        require(
            block.timestamp >= disputeStarted + ARBITRATION_TIMEOUT,
            "Arbitration period has not expired yet"
        );
        stage = Stage.Closed;
        emit ProjectClosed(msg.sender);
    }

    function setParties(
        address _contractor,
        address _arbiter,
        string memory _termsHash
    ) public payable {
        require(
            stage == Stage.Open || stage == Stage.Pending,
            "Parties can be set only in 'open' or 'pending' stage."
        );
        require(
            msg.sender == author,
            "Only the Project's Author can set the other parties."
        );
        require(
            _contractor != address(0) && _arbiter != address(0),
            "Contractor and arbiter addresses must be valid."
        );

        if (stage == Stage.Open) {
            require(
                msg.value >= arbitrationFee / 2,
                "Must stake half of the arbitration fee."
            );
        }

        coolingOffPeriodEnds = block.timestamp + COOLING_OFF_PERIOD;
        contractor = _contractor;
        arbiter = _arbiter;
        termsHash = _termsHash;
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
        emit SendFunds(msg.sender, msg.value);
        projectValue += msg.value;
    }

    function withdrawAsContractor() public payable {
        require(
            stage == Stage.Closed,
            "The contractor can only withdraw once the project is closed."
        );
        require(msg.sender == contractor, "Only the contractor can withdraw.");
        
        uint256 amountToPay = availableToContractor;
        require(amountToPay > 0, "Nothing to withdraw");

        availableToContractor = 0;

        uint256 platformFee = amountToPay / 100;
        uint256 remainder = amountToPay - platformFee;
        uint256 authorFee = remainder / 100;
        uint256 amountToWithdraw = remainder - authorFee;

        economy.updateEarnings(contractor, amountToWithdraw, true);
        if (authorFee > 0) {
            economy.updateEarnings(author, authorFee, true);
            (bool sentAuthor, ) = payable(author).call{value: authorFee}("");
            require(sentAuthor, "Failed to send Ether to author");
            emit AuthorPaid(author, authorFee);
        }
        
        if (amountToWithdraw > 0) {
            (bool sentContractor, ) = payable(contractor).call{
                value: amountToWithdraw
            }("");
            require(sentContractor, "Failed to send Ether to contractor");
        }

        if (platformFee > 0) {
            (bool sentEconomy, ) = payable(address(economy)).call{
                value: platformFee
            }("");
            require(sentEconomy, "Failed to send platform fee");
        }

        emit ContractorPaid(contractor, amountToWithdraw);
    }

    function updateContributorSpendings() public {
        require(
            disputeResolution < 100,
            "On disputed projects, spendings are updated in the withdraw function."
        );
        require(
            stage == Stage.Closed,
            "Stats can be updated once the project is closed."
        );
        uint expenditure = contributors[msg.sender];
        if (expenditure > 0) {
            contributors[msg.sender] = 0;
            economy.updateSpendings(msg.sender, expenditure, true);
        }
    }

    function reclaimArbitrationFee() public {
        require(
            stage == Stage.Closed,
            "Arbitration fee can be reclaimed once the project is closed."
        );
        require(
            arbitrationFeePaidOut == false,
            "The fee has been paid out to the Arbiter (because there was a dispute)."
        );
        require(
            msg.sender == author || msg.sender == contractor,
            "Arbitration fee can only be returned to the parties."
        );
        uint amountToWithdraw = arbitrationFee / 2;
        if (msg.sender == author) {
            require(
                authorWithdrawnArbitrationFee == false,
                "You have already claimed this back."
            );
            authorWithdrawnArbitrationFee = true;
            (bool sent, ) = payable(author).call{value: amountToWithdraw}("");
            require(sent, "Failed to withdraw.");
        } else if (msg.sender == contractor) {
            require(
                contractorWithdrawnArbitrationFee == false,
                "You have already claimed this back."
            );
            contractorWithdrawnArbitrationFee = true;
            (bool sent, ) = payable(contractor).call{
                value: amountToWithdraw
            }("");
            require(sent, "Failed to withdraw.");
        }
    }

    function withdrawAsContributor() public {
        require(
            stage == Stage.Open ||
                stage == Stage.Pending ||
                stage == Stage.Closed,
            "Withdrawals only allowed when the project is open, pending or closed."
        );

        uint256 contributorAmount = contributors[msg.sender];
        require(contributorAmount > 0, "No contributions to withdraw.");

        contributors[msg.sender] = 0;
        uint256 exitAmount = (contributorAmount * (100 - disputeResolution)) /
            100;
        uint256 expenditure = contributorAmount - exitAmount;
        projectValue -= exitAmount;

        if (disputeResolution > 0) {
            economy.updateSpendings(msg.sender, expenditure, true);
        }

        (bool sent, ) = payable(msg.sender).call{value: exitAmount}("");
        require(sent, "Failed to send Ether");

        emit ContributorWithdrawn(msg.sender, exitAmount);
    }

    function signContract() public payable {
        require(
            msg.sender == contractor,
            "Only the designated contractor can sign the contract"
        );
        require(
            stage == Stage.Pending,
            "The project can only be signed while in `pending` stage."
        );
        require(
            block.timestamp > coolingOffPeriodEnds,
            "Contract signing is blocked during the cooling-off period."
        );
        require(
            msg.value >= arbitrationFee / 2,
            "Must stake half the arbitration fee to sign the contract."
        );
        require(projectValue > 0, "Can't sign a contract with no funds in it.");
        stage = Stage.Ongoing;
        emit ContractSigned(msg.sender);
    }

    function reimburse() public {
        require(
            msg.sender == contractor,
            "Only the contractor can call this function."
        );
        require(
            stage == Stage.Ongoing,
            "This action can only be performed while the project is ongoing."
        );
        stage = Stage.Closed;
        emit ProjectClosed(msg.sender);
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

        if (totalVotesForRelease > (projectValue * 70) / 100) {
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

        if (totalVotesForDispute > (projectValue * 70) / 100) {
            stage = Stage.Dispute;
            disputeStarted = block.timestamp;
            emit ProjectDisputed(msg.sender);
        }
    }

    function disputeAsContractor() public {
        require(
            msg.sender == contractor,
            "Only the designated Contractor can call this function"
        );
        require(
            stage == Stage.Ongoing,
            "This can only be called while the project is ongoing"
        );
        stage = Stage.Dispute;
        disputeStarted = block.timestamp;
        emit ProjectDisputed(msg.sender);
    }

    function arbitrate(uint256 percent, string memory rulingHash) public {
        require(stage == Stage.Dispute, "Arbitration can only occur if the project is in dispute.");
        require(msg.sender == arbiter, "Only the Arbiter can call this function");
        require(percent >= 0 && percent <= 100, "Resolution needs to be a number between 0 and 100");

        availableToContractor = (projectValue * percent) / 100;
        disputeResolution = percent;
        ruling_hash = rulingHash;
        arbitrationFeePaidOut = true;
        stage = Stage.Closed;

        (bool sentArbiter, ) = payable(arbiter).call{value: arbitrationFee}("");
        require(sentArbiter, "Failed to send arbitration fee to arbiter");
        economy.updateEarnings(arbiter, arbitrationFee, true);
        emit ArbitrationDecision(msg.sender, percent, rulingHash);
        emit ProjectClosed(msg.sender);
    }
}
// NativeProject.sol