// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IEconomy.sol";
import "./IGovernedEconomy.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "@openzeppelin/contracts/governance/IGovernor.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract ERC20Project is Initializable {
    IEconomy public economy;
    IERC20 public token;
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
    event OrphanedTokensSwept(address indexed token, uint256 amount);

    function initialize(
        address payable _economy,
        address _tokenAddress,
        string memory _name,
        address _author,
        address _contractor,
        address _arbiter,
        string memory _termsHash,
        string memory _repo,
        uint _arbitrationFee,
        address _daoTimelock,
        address _daoGovernor
    ) public initializer {
        economy = IEconomy(_economy);
        token = IERC20(_tokenAddress);
        fundsReleased = false;
        name = _name;
        author = _author;
        contractor = _contractor;
        arbiter = _arbiter;
        termsHash = _termsHash;
        repo = _repo;
        arbitrationFee = _arbitrationFee;
        ruling_hash = "";

        daoTimelock = _daoTimelock;
        daoGovernor = _daoGovernor;

        economy.registerProjectRoles(address(this), _author, _contractor, _arbiter);

        if (contractor != address(0) && arbiter != address(0)) {
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

    function sendFunds(uint256 amount) public {
        require(
            stage == Stage.Open || stage == Stage.Pending,
            "Funding is only allowed when the project is in 'open' or 'pending' stage."
        );
        require(amount > 0, "Amount must be greater than zero.");
        
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed. Did you approve?"
        );

        if (contributors[msg.sender] == 0) {
            backers.push(msg.sender);
        }
        contributors[msg.sender] += amount;
        projectValue += amount;
        emit SendFunds(msg.sender, amount);
    }

    function signContract() public {
        require(msg.sender == contractor, "Only the designated contractor can sign the contract");
        require(stage == Stage.Pending, "The project can only be signed while in `pending` stage.");
        require(block.timestamp > coolingOffPeriodEnds, "Contract signing is blocked during the cooling-off period.");
        require(projectValue > 0, "Can't sign a contract with no funds in it.");
        
        require(token.transferFrom(msg.sender, address(this), arbitrationFee / 2), "Must stake half the arbitration fee to sign.");

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
        availableToContractor = (projectValue * percent) / 100;
        stage = Stage.Closed;
        
        if (arbiterHasRuled) {
            arbitrationFeePaidOut = true;
            require(token.transfer(arbiter, arbitrationFee), "Failed to send arbitration fee to arbiter");
            economy.updateEarnings(arbiter, arbitrationFee, address(token));
        } else {
            // ** THE FIX: Mark fee as paid out even when forfeited to prevent reclaims. **
            arbitrationFeePaidOut = true;
            require(token.transfer(address(economy), arbitrationFee), "Failed to send forfeited fee to DAO");
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
        
        economy.updateEarnings(contractor, amountToWithdraw, address(token));
        if (authorFee > 0) {
            economy.updateEarnings(author, authorFee, address(token));
            require(token.transfer(author, authorFee), "Failed to send fee to author");
            emit AuthorPaid(author, authorFee);
        }

        if (amountToWithdraw > 0) {
            require(token.transfer(contractor, amountToWithdraw), "Failed to send tokens to contractor");
        }

        if (platformFee > 0) {
            require(token.transfer(address(economy), platformFee), "Failed to send platform fee");
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
            economy.updateSpendings(msg.sender, expenditure, address(token));
        }
        
        if (exitAmount > 0) {
            require(token.transfer(msg.sender, exitAmount), "Failed to send tokens");
        }

        emit ContributorWithdrawn(msg.sender, exitAmount);
    }
    
    function reclaimArbitrationFee() public {
        require(
            stage == Stage.Closed,
            "Arbitration fee can be reclaimed once the project is closed."
        );
        require(
            !arbitrationFeePaidOut,
            "The fee has been paid out to the Arbiter (because there was a dispute)."
        );
        require(
            msg.sender == author || msg.sender == contractor,
            "Arbitration fee can only be returned to the parties."
        );
        
        uint amountToWithdraw = arbitrationFee / 2;

        if (msg.sender == author) {
            require(!authorWithdrawnArbitrationFee, "You have already claimed this back.");
            authorWithdrawnArbitrationFee = true;
            require(token.transfer(author, amountToWithdraw), "Failed to withdraw.");
        } else {
            require(!contractorWithdrawnArbitrationFee, "You have already claimed this back.");
            contractorWithdrawnArbitrationFee = true;
            require(token.transfer(contractor, amountToWithdraw), "Failed to withdraw.");
        }
    }
    
    function daoVeto() public {
        require(msg.sender == daoTimelock, "Only the DAO Timelock can veto a project.");
        require(stage != Stage.Closed, "Cannot veto a closed project.");
        stage = Stage.Closed;
        disputeResolution = 0; // Ensures 100% refund to backers.
        emit VetoedByDao(msg.sender);
    }

    function sweepOrphanedTokens(address tokenAddress) external {
        require(msg.sender == daoTimelock, "Only the DAO Timelock can sweep tokens.");
        IERC20 sweepToken = IERC20(tokenAddress);
        uint256 totalBalance = sweepToken.balanceOf(address(this));
        uint256 trackedBalance = (tokenAddress == address(token)) ? projectValue : 0;
        
        if (tokenAddress == address(token)) {
            if (stage == Stage.Pending || stage == Stage.Ongoing || stage == Stage.Dispute || stage == Stage.Appealable || stage == Stage.Appeal) {
                 if (!arbitrationFeePaidOut) {
                    trackedBalance += arbitrationFee;
                 }
            }
        }
        
        if (totalBalance > trackedBalance) {
            uint256 orphanedAmount = totalBalance - trackedBalance;
            require(sweepToken.transfer(address(economy), orphanedAmount), "Failed to sweep tokens");
            emit OrphanedTokensSwept(tokenAddress, orphanedAmount);
        }
    }
}
// ERC20Project.sol