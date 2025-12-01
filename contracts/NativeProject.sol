// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IEconomy.sol";
import "./IGovernedEconomy.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "@openzeppelin/contracts/governance/IGovernor.sol";
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
    bool public contractorReclaimedStake = false;

    address public daoTimelock;
    address public daoGovernor;

    enum Stage { Open, Pending, Ongoing, Dispute, Appealable, Appeal, Closed }
    Stage public stage;

    uint public appealEnds;
    uint public originalDisputeResolution;
    string public originalRulingHash;
    bool public arbiterHasRuled = false;

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
    event ArbitrationAppealed(address indexed appealer, uint256 indexed proposalId);
    event ArbitrationFinalized(address indexed finalizer);
    event DaoOverruled(address indexed timelock, uint256 percent, string rulingHash);
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

        // arbitrationFee is now calculated at signing time based on projectValue

        economy.registerProjectRoles(address(this), _author, _contractor, _arbiter);

        if (contractor != address(0) && arbiter != address(0)) {
            stage = Stage.Pending;
        } else {
            stage = Stage.Open;
        }

        // Initial funding from author (if any) goes to projectValue
        if (msg.value > 0) {
            backers.push(_author);
            contributors[_author] = msg.value;
            projectValue = msg.value;
            emit SendFunds(_author, msg.value);
        }
    }
    
    receive() external payable {
        sendFunds();
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

    function setParties(address _contractor, address _arbiter, string memory _termsHash) public {
        require(stage == Stage.Open, "Parties can only be set in 'open' stage.");
        require(msg.sender == author, "Only the Project's Author can set the other parties.");
        require(_contractor != address(0) && _arbiter != address(0), "Contractor and arbiter addresses must be valid.");

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
        require(projectValue > 0, "Can't sign a contract with no funds in it.");

        // Calculate arbitration fee based on project value at signing time
        uint feeBps = IGovernedEconomy(address(economy)).arbitrationFeeBps();
        arbitrationFee = (projectValue * feeBps) / 10000;

        // Contractor must stake their half of the arbitration fee
        require(msg.value >= arbitrationFee / 2, "Must stake half the arbitration fee to sign the contract.");

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
        require(msg.sender == arbiter, "Only the Arbiter can call this function");
        require(stage == Stage.Dispute, "Arbitration can only occur if the project is in dispute.");
        require(percent <= 100, "Resolution needs to be a number between 0 and 100");

        originalDisputeResolution = percent;
        originalRulingHash = rulingHash;
        arbiterHasRuled = true;
        stage = Stage.Appealable;
        appealEnds = block.timestamp + IGovernedEconomy(address(economy)).appealPeriod();
        
        emit ArbitrationDecision(msg.sender, percent, rulingHash);
    }

    function appeal(uint256 proposalId, address[] calldata targets) external {
        IGovernedEconomy governedEconomy = IGovernedEconomy(address(economy));
        
        require(
            stage == Stage.Appealable ||
            (stage == Stage.Dispute && block.timestamp > disputeStarted + governedEconomy.appealPeriod()),
            "Appeal not allowed at this time"
        );
        
        if (stage == Stage.Appealable) {
            require(block.timestamp <= appealEnds, "Appeal initiation period has ended");
        }
        
        address repTokenAddress = governedEconomy.repTokenAddress();
        uint256 threshold = governedEconomy.projectThreshold();
        uint256 votingPower = IVotes(repTokenAddress).getVotes(msg.sender);
        require(votingPower >= threshold, "Insufficient voting power to appeal");

        IGovernor.ProposalState propState = IGovernor(daoGovernor).state(proposalId);
        require(
            propState == IGovernor.ProposalState.Pending ||
            propState == IGovernor.ProposalState.Active ||
            propState == IGovernor.ProposalState.Succeeded ||
            propState == IGovernor.ProposalState.Queued,
            "Invalid proposal state"
        );

        require(targets.length > 0 && targets[0] == address(this), "Proposal does not target this project");

        stage = Stage.Appeal;
        appealEnds = block.timestamp + governedEconomy.appealPeriod();
        emit ArbitrationAppealed(msg.sender, proposalId);
    }
    
    function daoOverrule(uint256 percent, string memory rulingHash) public {
        require(msg.sender == daoTimelock, "Only the DAO Timelock can overrule");
        require(stage == Stage.Appeal, "DAO can only overrule during appeal stage");
        require(block.timestamp <= appealEnds, "Appeal period has ended");
        require(percent <= 100, "Resolution needs to be a number between 0 and 100");

        _finalizeDispute(percent, rulingHash);
        emit DaoOverruled(msg.sender, percent, rulingHash);
    }

    function finalizeArbitration() public {
        require(
            stage == Stage.Appealable || stage == Stage.Appeal,
            "Project not in a finalizable stage"
        );
        require(block.timestamp > appealEnds, "Appeal/Finalization period has not ended yet");
        
        _finalizeDispute(originalDisputeResolution, originalRulingHash);
        emit ArbitrationFinalized(msg.sender);
    }

    function _finalizeDispute(uint256 percent, string memory rulingHash) private {
        disputeResolution = percent;
        ruling_hash = rulingHash;
        stage = Stage.Closed;
        arbitrationFeePaidOut = true;

        // Arbiter fee: half from contractor's stake, half from project funds
        uint contractorStake = arbitrationFee / 2;
        uint contributorShare = arbitrationFee - contractorStake; // Handles odd amounts

        // Deduct contributor share from project value before calculating contractor's share
        uint projectValueAfterArbFee = projectValue - contributorShare;
        availableToContractor = (projectValueAfterArbFee * percent) / 100;

        if (arbiterHasRuled) {
            // Pay arbiter the full fee
            (bool sentArbiter, ) = payable(arbiter).call{value: arbitrationFee}("");
            require(sentArbiter, "Failed to send arbitration fee to arbiter");
            economy.updateEarnings(arbiter, arbitrationFee, economy.NATIVE_CURRENCY());
        } else {
            // Arbiter didn't rule - forfeit fee to DAO
            (bool sentEconomy, ) = payable(address(economy)).call{value: arbitrationFee}("");
            require(sentEconomy, "Failed to send forfeited fee to DAO");
        }

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

        uint256 exitAmount;
        uint256 expenditure;

        if (arbitrationFeePaidOut) {
            // Dispute occurred - half of arbitration fee came from project funds
            // Calculate contributor's share of that fee proportionally
            uint contributorArbFeeShare = (arbitrationFee / 2 * contributorAmount) / projectValue;
            uint remainingContribution = contributorAmount - contributorArbFeeShare;
            exitAmount = (remainingContribution * (100 - disputeResolution)) / 100;
            expenditure = contributorAmount - exitAmount;
        } else {
            // No dispute - standard calculation
            exitAmount = (contributorAmount * (100 - disputeResolution)) / 100;
            expenditure = contributorAmount - exitAmount;
        }

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
    
    function reclaimArbitrationStake() public {
        require(stage == Stage.Closed, "Stake can only be reclaimed once the project is closed.");
        require(arbitrationFeePaidOut == false, "Stake was used to pay the arbiter.");
        require(msg.sender == contractor, "Only the contractor can reclaim their stake.");
        require(contractorReclaimedStake == false, "You have already reclaimed your stake.");

        contractorReclaimedStake = true;
        uint stakeAmount = arbitrationFee / 2;
        (bool sent, ) = payable(contractor).call{value: stakeAmount}("");
        require(sent, "Failed to withdraw stake.");
    }
    
    function daoVeto() public {
        require(msg.sender == daoTimelock, "Only the DAO Timelock can veto a project.");
        require(stage != Stage.Closed, "Cannot veto a closed project.");
        stage = Stage.Closed;
        disputeResolution = 0; // Ensures 100% refund to backers.
        emit VetoedByDao(msg.sender);
    }
}
// NativeProject.sol