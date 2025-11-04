# Folder Structure

- trustless-contracts/
  - contracts/
    - ERC20Project.sol
    - Economy.sol
    - IAdminToken.sol
    - IEconomy.sol
    - IGovernedEconomy.sol
    - IGovernor.sol
    - IJurisdictionData.sol
    - IVotes.sol
    - NativeProject.sol
    - Registry.sol
    - RepToken.sol
    - test/
      - MockGovernor.sol
      - MockRepToken.sol
      - TestToken.sol
  - test/
    - RepToken.test.js
    - appeals.test.js
    - dao-governance.test.js
    - project-lifecycle.test.js

# File Contents

### `contracts/ERC20Project.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IEconomy.sol";
import "./IGovernedEconomy.sol";
import "./IVotes.sol";
import "./IGovernor.sol";
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
```

### `contracts/Economy.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IEconomy.sol";
import "./NativeProject.sol";
import "./ERC20Project.sol";

// NEW: Interface to check RepToken balance for projectThreshold
interface IRepToken {
    function balanceOf(address account) external view returns (uint256);
}

contract Economy is IEconomy {
    // --- STATE: DAO Governance ---
    address public timelockAddress;
    address public registryAddress;
    address public governorAddress;
    address public repTokenAddress;

    address public constant override NATIVE_CURRENCY = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // --- STATE: DAO-Controlled Parameters ---
    uint public nativeArbitrationFee;
    uint public platformFeeBps;
    uint public authorFeeBps;
    uint public coolingOffPeriod;
    uint public backersVoteQuorumBps;
    uint public projectThreshold;
    uint public appealPeriod; // NEW

    // --- STATE: Project & User Ledgers ---
    address public nativeProjectImplementation;
    address public erc20ProjectImplementation;

    address[] public deployedProjects;
    mapping(address => bool) public isProjectContract;

    mapping(address => mapping(address => uint)) public earnings; // user => token => amount
    mapping(address => mapping(address => uint)) public spendings; // user => token => amount

    mapping(address => address[]) private _earnedTokens;
    mapping(address => address[]) private _spentTokens;
    mapping(address => mapping(address => bool)) private _hasEarnedToken;
    mapping(address => mapping(address => bool)) private _hasSpentToken;

    mapping(address => address[]) public projectsAsAuthor;
    mapping(address => address[]) public projectsAsContractor;
    mapping(address => address[]) public projectsAsArbiter;

    struct UserProfile {
        address[] earnedTokens;
        uint[] earnedAmounts;
        address[] spentTokens;
        uint[] spentAmounts;
        address[] projectsAsAuthor;
        address[] projectsAsContractor;
        address[] projectsAsArbiter;
    }

    // --- EVENTS ---
    event InboundValue();
    event NewProject(address indexed contractAddress, string projectName, address contractor, address arbiter, string termsHash, string repo, string description, address token);
    event DaoAddressesSet(address timellock, address registry, address governor, address repToken);
    event PlatformFeeSet(uint newFeeBps);
    event AuthorFeeSet(uint newFeeBps);
    event NativeArbitrationFeeSet(uint newFee);
    event CoolingOffPeriodSet(uint newPeriod);
    event BackersVoteQuorumSet(uint newQuorumBps);
    event ProjectThresholdSet(uint newThreshold);
    event AppealPeriodSet(uint newPeriod); // NEW

    constructor() {
        platformFeeBps = 100; // 1%
        authorFeeBps = 100;   // 1%
        coolingOffPeriod = 2 minutes;
        backersVoteQuorumBps = 7000; // 70%
        appealPeriod = 7 days; // NEW: Default appeal period
    }

    function setImplementations(address _native, address _erc20) external {
        require(timelockAddress == address(0) || msg.sender == timelockAddress, "Protected");
        nativeProjectImplementation = _native;
        erc20ProjectImplementation = _erc20;
    }
    
    fallback() external payable { emit InboundValue(); }
    receive() external payable { emit InboundValue(); }

    function getNumberOfProjects() public view returns (uint) { return deployedProjects.length; }

    function getUser(address userAddress) public view returns (UserProfile memory) {
        address[] memory earnedTokenList = _earnedTokens[userAddress];
        uint[] memory earnedAmounts = new uint[](earnedTokenList.length);
        for(uint i = 0; i < earnedTokenList.length; i++) {
            earnedAmounts[i] = earnings[userAddress][earnedTokenList[i]];
        }

        address[] memory spentTokenList = _spentTokens[userAddress];
        uint[] memory spentAmounts = new uint[](spentTokenList.length);
        for(uint i = 0; i < spentTokenList.length; i++) {
            spentAmounts[i] = spendings[userAddress][spentTokenList[i]];
        }

        return UserProfile({
            earnedTokens: earnedTokenList,
            earnedAmounts: earnedAmounts,
            spentTokens: spentTokenList,
            spentAmounts: spentAmounts,
            projectsAsAuthor: projectsAsAuthor[userAddress],
            projectsAsContractor: projectsAsContractor[userAddress],
            projectsAsArbiter: projectsAsArbiter[userAddress]
        });
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
        require(repTokenAddress != address(0) && IRepToken(repTokenAddress).balanceOf(msg.sender) >= projectThreshold, "Insufficient reputation to create a project");

        address payable clone = payable(Clones.clone(nativeProjectImplementation));
        
        deployedProjects.push(clone);
        isProjectContract[clone] = true;

        NativeProject(clone).initialize{value: msg.value}(
            payable(address(this)), name, msg.sender, contractor, arbiter, 
            termsHash, repo, timelockAddress, governorAddress
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
        require(repTokenAddress != address(0) && IRepToken(repTokenAddress).balanceOf(msg.sender) >= projectThreshold, "Insufficient reputation to create a project");

        address clone = Clones.clone(erc20ProjectImplementation);
        
        deployedProjects.push(clone);
        isProjectContract[clone] = true;

        ERC20Project(clone).initialize(
            payable(address(this)), tokenAddress, name, msg.sender, contractor, arbiter,
            termsHash, repo, tokenArbitrationFee, timelockAddress, governorAddress
        );

        if (contractor != address(0) && arbiter != address(0)) {
            uint feeStake = tokenArbitrationFee / 2;
            IERC20(tokenAddress).transferFrom(msg.sender, clone, feeStake);
        }
        
        emit NewProject(clone, name, contractor, arbiter, termsHash, repo, description, tokenAddress);
    }

    function updateEarnings(address user, uint amount, address tokenAddress) external override {
        require(isProjectContract[msg.sender], "Only Project contracts can call this function.");
        earnings[user][tokenAddress] += amount;
        if (!_hasEarnedToken[user][tokenAddress]) {
            _earnedTokens[user].push(tokenAddress);
            _hasEarnedToken[user][tokenAddress] = true;
        }
    }

    function updateSpendings(address user, uint amount, address tokenAddress) external override {
        require(isProjectContract[msg.sender], "Only Project contracts can call this function.");
        spendings[user][tokenAddress] += amount;
        if (!_hasSpentToken[user][tokenAddress]) {
            _spentTokens[user].push(tokenAddress);
            _hasSpentToken[user][tokenAddress] = true;
        }
    }
    
    function registerProjectRoles(address projectAddress, address author, address contractor, address arbiter) external override {
        require(isProjectContract[msg.sender], "Only Project contracts can call this function.");
        require(msg.sender == projectAddress, "Project can only register its own roles.");

        if (author != address(0)) { projectsAsAuthor[author].push(projectAddress); }
        if (contractor != address(0)) { projectsAsContractor[contractor].push(projectAddress); }
        if (arbiter != address(0)) { projectsAsArbiter[arbiter].push(projectAddress); }
    }

    function setDaoAddresses(address _timelock, address _registry, address _governor, address _repToken) external {
        require(timelockAddress == address(0), "DAO addresses can only be set once.");
        timelockAddress = _timelock;
        registryAddress = _registry;
        governorAddress = _governor;
        repTokenAddress = _repToken;
        emit DaoAddressesSet(_timelock, _registry, _governor, _repToken);
    }

    function setPlatformFee(uint newFeeBps) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        platformFeeBps = newFeeBps;
        emit PlatformFeeSet(newFeeBps);
    }

    function setAuthorFee(uint newFeeBps) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        authorFeeBps = newFeeBps;
        emit AuthorFeeSet(newFeeBps);
    }

    function setNativeArbitrationFee(uint newFee) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        nativeArbitrationFee = newFee;
        emit NativeArbitrationFeeSet(newFee);
    }

    function setCoolingOffPeriod(uint newPeriod) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        coolingOffPeriod = newPeriod;
        emit CoolingOffPeriodSet(newPeriod);
    }

    function setBackersVoteQuorum(uint newQuorumBps) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        require(newQuorumBps >= 5000 && newQuorumBps <= 9900, "Quorum must be between 50% and 99%");
        backersVoteQuorumBps = newQuorumBps;
        emit BackersVoteQuorumSet(newQuorumBps);
    }

    function setProjectThreshold(uint newThreshold) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        projectThreshold = newThreshold;
        emit ProjectThresholdSet(newThreshold);
    }

    function setAppealPeriod(uint newPeriod) external {
        require(msg.sender == timelockAddress, "Only DAO Timelock can call");
        appealPeriod = newPeriod;
        emit AppealPeriodSet(newPeriod);
    }

    function withdrawNative() public {
        require(msg.sender == timelockAddress, "Only the DAO can withdraw Ether");
        payable(registryAddress).transfer(address(this).balance);
    }

    function withdrawTokens(address tokenAddress) public {
        require(msg.sender == timelockAddress, "Only the DAO can withdraw tokens.");
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw.");
        require(token.transfer(registryAddress, balance), "Token withdrawal failed.");
    }
}
// Economy.sol
```

### `contracts/IAdminToken.sol`
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAdminToken {
    function setAdmin(address newAdmin) external;
}
// IAdminToken.sol
```

### `contracts/IEconomy.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IEconomy {
    function updateEarnings(address user, uint amount, address tokenAddress) external;
    function updateSpendings(address user, uint amount, address tokenAddress) external;
    function registerProjectRoles(address projectAddress, address author, address contractor, address arbiter) external;

    // NEW: Exposes the NATIVE_CURRENCY constant from Economy.sol via a getter.
    function NATIVE_CURRENCY() external view returns (address);
}
// IEconomy.sol
```

### `contracts/IGovernedEconomy.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// This interface defines the getters for DAO-governed parameters
// that Project contracts need to read from the main Economy contract.
interface IGovernedEconomy {
    function coolingOffPeriod() external view returns (uint);
    function nativeArbitrationFee() external view returns (uint);
    function platformFeeBps() external view returns (uint);
    function authorFeeBps() external view returns (uint);
    function backersVoteQuorumBps() external view returns (uint);
    function appealPeriod() external view returns (uint); // NEW
    function repTokenAddress() external view returns (address); // NEW
    function projectThreshold() external view returns (uint); // NEW
}
// IGovernedEconomy.sol
```

### `contracts/IGovernor.sol`
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGovernor Interface
 * @dev Defines the functions and enums required to interact with a standard
 * OpenZeppelin Governor contract, specifically to check the state of a proposal.
 */
interface IGovernor {
    /**
     * @dev Enum representing the state of a governance proposal.
     */
    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    /**
     * @dev Returns the state of a given proposal.
     * @param proposalId The ID of the proposal to check.
     * @return The state of the proposal as a ProposalState enum member.
     */
    function state(uint256 proposalId) external view returns (ProposalState);
}
// IGovernor.sol
```

### `contracts/IJurisdictionData.sol`
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IJurisdictionData Interface
 * @dev Defines read-only functions required by other contracts to query epoch data from the Jurisdiction contract.
 */
interface IJurisdictionData {
    /**
     * @dev Returns the start timestamp of a specific passive income epoch.
     * @param epochId The ID of the epoch to query.
     * @return The unix timestamp (as uint48) when the epoch started.
     */
    function getPassiveIncomeEpochStart(uint256 epochId) external view returns (uint48);

    /**
     * @dev Returns the start timestamp of a specific delegate reward epoch.
     * @param epochId The ID of the epoch to query.
     * @return The unix timestamp (as uint48) when the epoch started.
     */
    function getDelegateRewardEpochStart(uint256 epochId) external view returns (uint48);
}
// IJurisdictionData.sol
```

### `contracts/IVotes.sol`
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVotes Interface
 * @dev Defines the function required to check an account's current voting power.
 * This is typically implemented by governance tokens following the ERC20Votes standard.
 */
interface IVotes {
    /**
     * @dev Gets the current voting power of an address.
     * @param account The address to check.
     * @return The voting power of the account.
     */
    function getVotes(address account) external view returns (uint256);
}
// IVotes.sol
```

### `contracts/NativeProject.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IEconomy.sol";
import "./IGovernedEconomy.sol";
import "./IVotes.sol";
import "./IGovernor.sol";
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

        arbitrationFee = IGovernedEconomy(_economy).nativeArbitrationFee();

        economy.registerProjectRoles(address(this), _author, _contractor, _arbiter);

        if (contractor != address(0) && arbiter != address(0)) {
            require(msg.value >= arbitrationFee / 2, "Must stake half of the arbitration fee");
            stage = Stage.Pending;
        } else {
            stage = Stage.Open;
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
            (bool sentArbiter, ) = payable(arbiter).call{value: arbitrationFee}("");
            require(sentArbiter, "Failed to send arbitration fee to arbiter");
            economy.updateEarnings(arbiter, arbitrationFee, economy.NATIVE_CURRENCY());
        } else {
            // ** THE FIX: Mark fee as paid out even when forfeited to prevent reclaims. **
            arbitrationFeePaidOut = true;
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
        disputeResolution = 0; // Ensures 100% refund to backers.
        emit VetoedByDao(msg.sender);
    }
}
// NativeProject.sol
```

### `contracts/Registry.sol`
```sol
// contracts/Registry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {IJurisdictionData} from "./IJurisdictionData.sol"; // <-- ADDED IMPORT

contract Registry is IERC721Receiver, ReentrancyGuard {

    mapping (string => string) private reg;
    string[] private keys;
    address public owner;
    address public wrapper;
    address public jurisdictionAddress;
    mapping(bytes32 => uint256) public earmarkedFunds;

    modifier _treasuryOps(){
         require(msg.sender == owner , "Only the DAO can make transfers");
        _;
    }

    modifier _regedit() {
        require(msg.sender == owner || msg.sender==wrapper, "Only the DAO can edit registry");
        _;
    }

    event ReceivedETH(address indexed from, uint256 amount);
    event ReceivedERC721(address indexed from, address indexed token, uint256 tokenId);
    event TransferredETH(address indexed to, uint256 amount);
    event TransferredERC20(address indexed token, address indexed to, uint256 amount);
    event TransferredERC721(address indexed token, address indexed to, uint256 tokenId);
    
    event JurisdictionAddressSet(address indexed jurisdiction);
    event FundsEarmarked(bytes32 indexed purpose, uint256 amount);
    event EarmarkedFundsWithdrawn(bytes32 indexed purpose, uint256 amount);
    event EarmarkedFundsDisbursed(address indexed recipient, bytes32 indexed purpose, uint256 amount);


     receive() external payable {
        emit ReceivedETH(msg.sender, msg.value);
    }
     function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        operator; data;
        emit ReceivedERC721(from, msg.sender, tokenId);
        return this.onERC721Received.selector;
    }

    function transferETH(address payable to, uint256 amount) _treasuryOps external nonReentrant {
        require(address(this).balance >= amount, "Insufficient balance");
        to.transfer(amount);
        emit TransferredETH(to, amount);
    }

    function transferERC20(
        address token,
        address to,
        uint256 amount
    ) external _treasuryOps {
        bool success = IERC20(token).transfer(to, amount);
        require(success, "ERC20 transfer failed");
        emit TransferredERC20(token, to, amount);
    }

    function transferERC721(
        address token,
        address to,
        uint256 tokenId
    ) external _treasuryOps {
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
        emit TransferredERC721(token, to, tokenId);
    }
    
    constructor(address _owner, address _wrapper) {
        require(_owner != address(0), "Owner address cannot be zero");
        owner = _owner;
        wrapper=_wrapper;
    }

    event RegistryUpdated(string  key, string  value);

    function editRegistry(string memory key, string memory value) public _regedit {
        if (bytes(reg[key]).length == 0) {
            keys.push(key);
        }
        reg[key] = value;
        emit RegistryUpdated(key, value);
    }
    
    function batchEditRegistry(string[] memory newKeys, string[] memory values) public _regedit {
        for (uint256 i = 0; i < newKeys.length; i++) {
            string memory key = newKeys[i];
            string memory value = values[i];
            if (bytes(reg[key]).length == 0) {
                keys.push(key);
            }
            reg[key] = value;
        }
    }

    function getRegistryValue(string memory key) public view returns (string memory) {
        return reg[key];
    }

    function getAllKeys() public view returns (string[] memory) {
        return keys;
    }

    function getAllValues() public view returns (string[] memory) {
        string[] memory values = new string[](keys.length);
        for (uint i = 0; i < keys.length; i++) {
            values[i] = reg[keys[i]];
        }
        return values;
    }

    function setJurisdictionAddress(address _jurisdictionAddress) external _regedit {
        require(_jurisdictionAddress != address(0), "Jurisdiction address cannot be zero");
        jurisdictionAddress = _jurisdictionAddress;
        emit JurisdictionAddressSet(_jurisdictionAddress);
    }

    function earmarkFunds(bytes32 purpose, uint256 amount, address tokenAddress) external _treasuryOps {
        uint256 currentBalance = IERC20(tokenAddress).balanceOf(address(this));
        require(currentBalance >= earmarkedFunds[purpose] + amount, "Cannot earmark more than available balance");
        earmarkedFunds[purpose] += amount;
        emit FundsEarmarked(purpose, amount);
    }

    function withdrawEarmarkedFunds(bytes32 purpose, uint256 amount) external _treasuryOps {
        require(earmarkedFunds[purpose] >= amount, "Registry: Cannot withdraw more than earmarked");
        earmarkedFunds[purpose] -= amount;
        emit EarmarkedFundsWithdrawn(purpose, amount);
    }

    function disburseEarmarked(address recipient, uint256 amount, bytes32 purpose, address tokenAddress) external nonReentrant {
        require(msg.sender == jurisdictionAddress, "Registry: Caller is not the Jurisdiction");
        require(earmarkedFunds[purpose] >= amount, "Registry: Insufficient earmarked funds");
        
        uint256 currentBalance = IERC20(tokenAddress).balanceOf(address(this));
        require(currentBalance >= amount, "Registry: Insufficient token balance for disbursement");

        earmarkedFunds[purpose] -= amount;
        bool success = IERC20(tokenAddress).transfer(recipient, amount);
        require(success, "ERC20 transfer failed during disbursement");
        emit EarmarkedFundsDisbursed(recipient, purpose, amount);
    }

    /**
     * @notice Allows DAO governance to reclaim funds from a concluded benefits epoch after a grace period.
     * @dev The grace period starts from the beginning of the *next* epoch.
     * @param epochId The ID of the epoch to reclaim from.
     * @param paymentToken The address of the token used in that epoch.
     * @param isDelegateReward A boolean to specify which type of epoch it was.
     */
    function reclaimEarmarkedFunds(uint256 epochId, address paymentToken, bool isDelegateReward) external _treasuryOps {
        // 1. Get the configured grace period from this registry.
        string memory gracePeriodStr = getRegistryValue("benefits.claim.gracePeriod");
        uint256 gracePeriod = Strings.parseUint(gracePeriodStr);
        require(gracePeriod > 0, "Registry: Grace period not set");

        // 2. Determine the timestamp when the grace period started.
        // This is the start time of the *next* epoch (epochId + 1).
        uint48 gracePeriodStartTime;
        if (isDelegateReward) {
            gracePeriodStartTime = IJurisdictionData(jurisdictionAddress).getDelegateRewardEpochStart(epochId + 1);
        } else {
            gracePeriodStartTime = IJurisdictionData(jurisdictionAddress).getPassiveIncomeEpochStart(epochId + 1);
        }

        // 3. Perform the critical time check.
        require(gracePeriodStartTime > 0, "Registry: The subsequent epoch has not started yet");
        require(block.timestamp > gracePeriodStartTime + gracePeriod, "Registry: Claim grace period has not passed");

        // 4. Construct the purpose hash and reclaim the funds.
        bytes32 purpose;
        if (isDelegateReward) {
            purpose = keccak256(abi.encodePacked("DELEGATE_REWARD", epochId, paymentToken));
        } else {
            purpose = keccak256(abi.encodePacked("PASSIVE_INCOME", epochId, paymentToken));
        }
        
        uint256 remainingAmount = earmarkedFunds[purpose];
        require(remainingAmount > 0, "Registry: No funds to reclaim");
        
        earmarkedFunds[purpose] = 0;

        emit EarmarkedFundsWithdrawn(purpose, remainingAmount);
    }
   
}
// Registry.sol
```

### `contracts/RepToken.sol`
```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {IAdminToken} from "./IAdminToken.sol";
import {Registry} from "./Registry.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {IJurisdictionData} from "./IJurisdictionData.sol";

// NEW: Interface to the Economy contract to fetch a user's full financial profile.
interface IEconomyWithProfile {
    struct UserProfile {
        address[] earnedTokens;
        uint[] earnedAmounts;
        address[] spentTokens;
        uint[] spentAmounts;
        address[] projectsAsAuthor;
        address[] projectsAsContractor;
        address[] projectsAsArbiter;
    }
    function getUser(address userAddress) external view returns (UserProfile memory);
}

// RepToken is the specialized governance token for the Jurisdiction DAO.
// It inherits standard DAO token functionality but replaces generic reputation
// accrual with a "pull" mechanism that reads from a governed Economy contract.
contract RepToken is ERC20, ERC20Permit, ERC20Votes, IAdminToken, IJurisdictionData {
    using Checkpoints for Checkpoints.Trace208;

    address public admin;
    bool private adminSet;
    bool public constant isTransferable = false;

    address payable public immutable registryAddress;
    address public immutable timelockAddress;

    address public economyAddress;

    // MODIFIED: Separated claimed activity into earnings and spendings for cleaner logic.
    mapping(address => mapping(address => uint)) public claimedEarnings;
    mapping(address => mapping(address => uint)) public claimedSpendings;
    
    mapping(address => Checkpoints.Trace208) private _balanceHistory;

    struct RewardEpoch {
        uint256 budget;
        address paymentToken;
        uint48 startTimestamp;
    }

    uint256 public currentPassiveIncomeEpoch;
    mapping(uint256 => RewardEpoch) public passiveIncomeEpochs;
    mapping(uint256 => mapping(address => bool)) public hasClaimedPassiveIncome;

    uint256 public currentDelegateRewardEpoch;
    mapping(uint256 => RewardEpoch) public delegateRewardEpochs;
    mapping(uint256 => mapping(address => bool)) public hasClaimedDelegateReward;

    event NewPassiveIncomeEpoch(uint256 indexed epochId, uint256 budget, address indexed paymentToken);
    event PassiveIncomeClaimed(address indexed member, uint256 indexed epochId, uint256 amount);
    event NewDelegateRewardEpoch(uint256 indexed epochId, uint256 budget, address indexed paymentToken);
    event DelegateRewardClaimed(address indexed delegate, uint256 indexed epochId, uint256 amount);
    event ReputationClaimedFromEconomy(address indexed user, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        address payable _registryAddress,
        address _timelockAddress,
        address[] memory initialMembers,
        uint256[] memory initialAmounts
    )
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        require(_registryAddress != address(0) && _timelockAddress != address(0), "RepToken: Invalid addresses");
        registryAddress = _registryAddress;
        timelockAddress = _timelockAddress;
        adminSet = false;

        for (uint i = 0; i < initialMembers.length; i++) {
            _mint(initialMembers[i], initialAmounts[i]);
        }
    }

    // --- CORE JURISDICTION LOGIC (FIXED) ---

    function claimReputationFromEconomy() external {
        require(economyAddress != address(0), "RepToken: Economy address not set");
        
        IEconomyWithProfile.UserProfile memory profile = IEconomyWithProfile(economyAddress).getUser(msg.sender);
        
        uint256 totalReputationToMint = 0;

        // Process unclaimed earnings
        for (uint i = 0; i < profile.earnedTokens.length; i++) {
            address token = profile.earnedTokens[i];
            uint totalEarnings = profile.earnedAmounts[i];
            uint previouslyClaimed = claimedEarnings[msg.sender][token];
            
            if (totalEarnings > previouslyClaimed) {
                uint unclaimedAmount = totalEarnings - previouslyClaimed;
                totalReputationToMint += _calculateReputation(token, unclaimedAmount);
                claimedEarnings[msg.sender][token] = totalEarnings;
            }
        }
        
        // Process unclaimed spendings
        for (uint i = 0; i < profile.spentTokens.length; i++) {
            address token = profile.spentTokens[i];
            uint totalSpendings = profile.spentAmounts[i];
            uint previouslyClaimed = claimedSpendings[msg.sender][token];

            if (totalSpendings > previouslyClaimed) {
                uint unclaimedAmount = totalSpendings - previouslyClaimed;
                totalReputationToMint += _calculateReputation(token, unclaimedAmount);
                claimedSpendings[msg.sender][token] = totalSpendings;
            }
        }
        
        if (totalReputationToMint > 0) {
            _mint(msg.sender, totalReputationToMint);
            emit ReputationClaimedFromEconomy(msg.sender, totalReputationToMint);
        }
    }

    function _calculateReputation(address token, uint amount) internal view returns (uint256) {
        string memory parityKey = string.concat("jurisdiction.parity.", Strings.toHexString(uint160(token)));
        string memory parityStr = Registry(registryAddress).getRegistryValue(parityKey);
        
        if (bytes(parityStr).length > 0) {
            uint256 parity = Strings.parseUint(parityStr);
            if (parity > 0) {
                return amount * parity;
            }
        }
        return 0;
    }
    
    // --- LEGACY INCENTIVE MECHANISMS ---

    function startNewPassiveIncomeEpoch(uint256 budget, address paymentToken) external {
        require(msg.sender == timelockAddress, "RepToken: Only Timelock can start an epoch");
        currentPassiveIncomeEpoch++;
        passiveIncomeEpochs[currentPassiveIncomeEpoch] = RewardEpoch({
            budget: budget,
            paymentToken: paymentToken,
            startTimestamp: clock()
        });
        emit NewPassiveIncomeEpoch(currentPassiveIncomeEpoch, budget, paymentToken);
    }

    function startNewDelegateRewardEpoch(uint256 budget, address paymentToken) external {
        require(msg.sender == timelockAddress, "RepToken: Only Timelock can start an epoch");
        currentDelegateRewardEpoch++;
        delegateRewardEpochs[currentDelegateRewardEpoch] = RewardEpoch({
            budget: budget,
            paymentToken: paymentToken,
            startTimestamp: clock()
        });
        emit NewDelegateRewardEpoch(currentDelegateRewardEpoch, budget, paymentToken);
    }

    function claimPassiveIncome(uint256 epochId) external {
        RewardEpoch storage epoch = passiveIncomeEpochs[epochId];
        require(epochId > 0 && epochId <= currentPassiveIncomeEpoch, "RepToken: Invalid epoch ID");
        require(epoch.startTimestamp > 0, "RepToken: Epoch does not exist");
        require(!hasClaimedPassiveIncome[epochId][msg.sender], "RepToken: Already claimed for this epoch");
        uint256 snapshotTime = epoch.startTimestamp - 1;
        uint256 userReputation = _getPastBalance(msg.sender, snapshotTime);
        require(userReputation > 0, "RepToken: No reputation at epoch start");
        uint256 totalReputation = getPastTotalSupply(snapshotTime);
        require(totalReputation > 0, "RepToken: Zero total supply at epoch start");
        uint256 rewardAmount = (userReputation * epoch.budget) / totalReputation;
        require(rewardAmount > 0, "RepToken: Reward amount is zero");
        hasClaimedPassiveIncome[epochId][msg.sender] = true;
        bytes32 purpose = keccak256(abi.encodePacked("PASSIVE_INCOME", epochId, epoch.paymentToken));
        Registry(registryAddress).disburseEarmarked(msg.sender, rewardAmount, purpose, epoch.paymentToken);
        emit PassiveIncomeClaimed(msg.sender, epochId, rewardAmount);
    }

    function claimRepresentationReward(uint256 epochId) external {
        RewardEpoch storage epoch = delegateRewardEpochs[epochId];
        require(epochId > 0 && epochId <= currentDelegateRewardEpoch, "RepToken: Invalid epoch ID");
        require(epoch.startTimestamp > 0, "RepToken: Epoch does not exist");
        require(!hasClaimedDelegateReward[epochId][msg.sender], "RepToken: Already claimed for this epoch");
        uint256 snapshotTime = epoch.startTimestamp - 1;
        uint256 totalVotingPower = getPastVotes(msg.sender, snapshotTime);
        uint256 ownPastBalance = _getPastBalance(msg.sender, snapshotTime);
        require(totalVotingPower > ownPastBalance, "RepToken: No delegated votes at epoch start");
        uint256 delegatedVotes = totalVotingPower - ownPastBalance;
        uint256 totalReputation = getPastTotalSupply(snapshotTime);
        require(totalReputation > 0, "RepToken: Zero total supply at epoch start");
        uint256 rewardAmount = (delegatedVotes * epoch.budget) / totalReputation;
        require(rewardAmount > 0, "RepToken: Reward amount is zero");
        hasClaimedDelegateReward[epochId][msg.sender] = true;
        bytes32 purpose = keccak256(abi.encodePacked("DELEGATE_REWARD", epochId, epoch.paymentToken));
        Registry(registryAddress).disburseEarmarked(msg.sender, rewardAmount, purpose, epoch.paymentToken);
        emit DelegateRewardClaimed(msg.sender, epochId, rewardAmount);
    }

    // --- GETTERS & CONFIG ---
    function getPassiveIncomeEpochStart(uint256 epochId) external view override returns (uint48) {
        return passiveIncomeEpochs[epochId].startTimestamp;
    }

    function getDelegateRewardEpochStart(uint256 epochId) external view override returns (uint48) {
        return delegateRewardEpochs[epochId].startTimestamp;
    }

    function _getPastBalance(address account, uint256 timepoint) internal view returns (uint256) {
        require(timepoint < block.timestamp, "ERC20: snapshot query for future block");
        require(timepoint <= type(uint48).max, "RepToken: timepoint exceeds uint48 range");
        return _balanceHistory[account].upperLookup(uint48(timepoint));
    }

    function setEconomyAddress(address _economyAddress) external {
        require(msg.sender == admin || msg.sender == timelockAddress, "RepToken: Caller is not the admin or Timelock");
        require(economyAddress == address(0), "RepToken: Economy address already set");
        economyAddress = _economyAddress;
    }
    
    function decimals() public pure override returns (uint8) { return 18; }
    function CLOCK_MODE() public pure override returns (string memory) { return "mode=timestamp"; }
    function clock() public view override returns (uint48) { return uint48(block.timestamp); }

    function setAdmin(address newAdmin) public override {
        require(!adminSet, "Admin has already been set");
        admin = newAdmin;
        adminSet = true;
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
        uint48 timestamp = clock();
        if (from != address(0)) {
            _balanceHistory[from].push(timestamp, uint208(balanceOf(from)));
        }
        if (to != address(0)) {
            _balanceHistory[to].push(timestamp, uint208(balanceOf(to)));
        }
    }
    
    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) { return super.nonces(owner); }
    function transfer(address, uint256) public pure override returns (bool) { revert("RepToken: Reputation is non-transferable"); }
    function transferFrom(address, address, uint256) public pure override returns (bool) { revert("RepToken: Reputation is non-transferable"); }
}
// RepToken.sol
```

### `contracts/test/MockGovernor.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../IGovernor.sol";

// A mock Governor for testing the appeal mechanism.
contract MockGovernor is IGovernor {
    ProposalState public proposalState;

    // Test-only function to set the state of a proposal
    function setProposalState(ProposalState _newState) external {
        proposalState = _newState;
    }

    function state(uint256 proposalId) external view override returns (ProposalState) {
        proposalId; // silence warning
        return proposalState;
    }
}
// MockGovernor.sol
```

### `contracts/test/MockRepToken.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// A mock RepToken for testing the Economy's projectThreshold feature.
contract MockRepToken {
    mapping(address => uint256) public balances;

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    // This is the function required by the IVotes interface in the project contracts
    function getVotes(address account) external view returns (uint256) {
        return balances[account];
    }

    // Test-only function to mint tokens to an address
    function mint(address to, uint256 amount) external {
        balances[to] += amount;
    }
}
// MockRepToken.sol
```

### `contracts/test/TestToken.sol`
```sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// A basic ERC20 token for testing purposes.
contract TestToken is ERC20 {
    constructor() ERC20("Test Token", "TST") {
        _mint(msg.sender, 1000000 * 10**18); // Mint 1 million tokens to the deployer
    }
}
// TestToken.sol
```

### `test/RepToken.test.js`
```js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { impersonateAccount, stopImpersonatingAccount } = require("@nomicfoundation/hardhat-network-helpers");

describe("RepToken and Economy Integration", function () {
    let economy, repToken, testToken, registry, timelock;
    let deployer, author, contractor, user1;
    let mockProjectSigner; // To be used as a valid caller

    const NATIVE_CURRENCY = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");

    // This helper now uses the pre-configured mockProjectSigner
    async function updateEconomyState(updates) {
        for (const update of updates) {
            if (update.type === 'earnings') {
                await economy.connect(mockProjectSigner).updateEarnings(update.user.address, update.amount, update.token);
            } else if (update.type === 'spendings') {
                await economy.connect(mockProjectSigner).updateSpendings(update.user.address, update.amount, update.token);
            }
        }
    }

    beforeEach(async function () {
        [deployer, timelock, author, contractor, user1] = await ethers.getSigners();

        const RegistryFactory = await ethers.getContractFactory("Registry");
        registry = await RegistryFactory.deploy(timelock.address, deployer.address);
        
        const ERC20ProjectImpl = await ethers.getContractFactory("ERC20Project");
        const erc20ProjectImpl = await ERC20ProjectImpl.deploy();
        const EconomyFactory = await ethers.getContractFactory("Economy");
        economy = await EconomyFactory.deploy();
        
        await economy.connect(deployer).setImplementations(ethers.ZeroAddress, await erc20ProjectImpl.getAddress());
        
        const RepTokenFactory = await ethers.getContractFactory("RepToken");
        repToken = await RepTokenFactory.deploy("Jurisdiction Token", "JUR", await registry.getAddress(), timelock.address, [], []);
        const TestTokenFactory = await ethers.getContractFactory("TestToken");
        testToken = await TestTokenFactory.deploy();

        await testToken.connect(deployer).transfer(author.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(contractor.address, ethers.parseEther("10000"));
        
        await repToken.connect(deployer).setAdmin(timelock.address);
        await repToken.connect(timelock).setEconomyAddress(await economy.getAddress());
        await economy.connect(deployer).setDaoAddresses(timelock.address, await registry.getAddress(), deployer.address, await repToken.getAddress());
        
        const economyAddr = await economy.getAddress();
        await testToken.connect(author).approve(economyAddr, TOKEN_ARBITRATION_FEE / 2n);
        const tx = await economy.connect(author).createERC20Project("Mock Project", contractor.address, deployer.address, "t", "r", "d", await testToken.getAddress(), TOKEN_ARBITRATION_FEE);
        const receipt = await tx.wait();
        const mockProjectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        
        await impersonateAccount(mockProjectAddress);
        mockProjectSigner = await ethers.getSigner(mockProjectAddress);

        // --- THE FIX: Manually set the balance of the impersonated contract address ---
        // We give it 10 ETH to pay for gas fees in the tests.
        const oneEth = ethers.parseEther("10.0").toString(16); // Hex value of 10 ETH
        await ethers.provider.send("hardhat_setBalance", [
            mockProjectAddress,
            "0x" + oneEth,
        ]);

        const nativeParityKey = `jurisdiction.parity.${NATIVE_CURRENCY.toLowerCase()}`;
        const tokenParityKey = `jurisdiction.parity.${(await testToken.getAddress()).toLowerCase()}`;
        
        await registry.connect(timelock).editRegistry(nativeParityKey, "1");
        await registry.connect(timelock).editRegistry(tokenParityKey, "2");
    });

    afterEach(async function() {
        if (mockProjectSigner) {
            await stopImpersonatingAccount(mockProjectSigner.address);
        }
    });

    it("should allow a user to claim reputation for the first time", async function () {
        const nativeEarnings = ethers.parseEther("10");
        const tokenEarnings = ethers.parseEther("100");
        
        await updateEconomyState([{ user: contractor, amount: nativeEarnings, token: NATIVE_CURRENCY, type: 'earnings' }, { user: contractor, amount: tokenEarnings, token: await testToken.getAddress(), type: 'earnings' }]);
        
        const expectedReputation = (nativeEarnings * 1n) + (tokenEarnings * 2n);
        
        await expect(repToken.connect(contractor).claimReputationFromEconomy())
            .to.emit(repToken, "ReputationClaimedFromEconomy")
            .withArgs(contractor.address, expectedReputation);
            
        expect(await repToken.balanceOf(contractor.address)).to.equal(expectedReputation);
    });

    it("should prevent a user from claiming the same earnings twice", async function () {
        const nativeEarnings = ethers.parseEther("5");
        await updateEconomyState([{ user: contractor, amount: nativeEarnings, token: NATIVE_CURRENCY, type: 'earnings' }]);

        await repToken.connect(contractor).claimReputationFromEconomy();
        const balanceAfterFirstClaim = await repToken.balanceOf(contractor.address);
        
        await repToken.connect(contractor).claimReputationFromEconomy();
        expect(await repToken.balanceOf(contractor.address)).to.equal(balanceAfterFirstClaim);
    });
    
    it("should allow a user to make an incremental claim for new earnings", async function() {
        const initialTokenEarnings = ethers.parseEther("50");
        await updateEconomyState([{ user: contractor, amount: initialTokenEarnings, token: await testToken.getAddress(), type: 'earnings' }]);
        
        await repToken.connect(contractor).claimReputationFromEconomy();
        const balanceAfterFirstClaim = await repToken.balanceOf(contractor.address);
        expect(balanceAfterFirstClaim).to.equal(initialTokenEarnings * 2n);

        const newTokenEarnings = ethers.parseEther("30");
        await updateEconomyState([{ user: contractor, amount: newTokenEarnings, token: await testToken.getAddress(), type: 'earnings' }]);

        await repToken.connect(contractor).claimReputationFromEconomy();
        const expectedSecondRep = newTokenEarnings * 2n;
        const finalBalance = await repToken.balanceOf(contractor.address);

        expect(finalBalance).to.equal(balanceAfterFirstClaim + expectedSecondRep);
    });

    it("should correctly calculate reputation when both earnings and spendings are present", async function() {
        const nativeEarnings = ethers.parseEther("10");
        const tokenSpendings = ethers.parseEther("200");
        const tokenAddress = await testToken.getAddress();

        await updateEconomyState([
            { user: user1, amount: nativeEarnings, token: NATIVE_CURRENCY, type: 'earnings' },
            { user: user1, amount: tokenSpendings, token: tokenAddress, type: 'spendings' }
        ]);

        const expectedReputation = (nativeEarnings * 1n) + (tokenSpendings * 2n);
        await repToken.connect(user1).claimReputationFromEconomy();
        expect(await repToken.balanceOf(user1.address)).to.equal(expectedReputation);
    });
    
    it("should respect changes in parity for new claims", async function() {
        const tokenEarnings = ethers.parseEther("100");
        await updateEconomyState([{ user: contractor, amount: tokenEarnings, token: await testToken.getAddress(), type: 'earnings' }]);
``
        const tokenParityKey = `jurisdiction.parity.${(await testToken.getAddress()).toLowerCase()}`;
        
        await registry.connect(timelock).editRegistry(tokenParityKey, "5");

        const expectedReputation = tokenEarnings * 5n;
        await repToken.connect(contractor).claimReputationFromEconomy();
        expect(await repToken.balanceOf(contractor.address)).to.equal(expectedReputation);
    });
});
// RepToken.test.js
```

### `test/appeals.test.js`
```js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Appeals and Advanced Fund Handling", function () {
    let economy, nativeProjectImpl, erc20ProjectImpl, testToken, mockRepToken, mockGovernor;
    let deployer, timelock, registry, author, contractor, arbiter, user1, daoMember;

    const NATIVE_ARBITRATION_FEE = ethers.parseEther("0.1");
    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");
    const PROJECT_THRESHOLD = ethers.parseEther("1000");

    // Helper to set up a project in the Dispute stage
    async function setupDisputedProject() {
        // Create an ERC20 project
        const economyAddr = await economy.getAddress();
        await testToken.connect(author).approve(economyAddr, TOKEN_ARBITRATION_FEE / 2n);
        const tx = await economy.connect(author).createERC20Project(
            "Appeal Test", contractor.address, arbiter.address, "t", "r", "d",
            await testToken.getAddress(), TOKEN_ARBITRATION_FEE
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        const project = await ethers.getContractAt("ERC20Project", projectAddress);

        // Fund and start it
        const fundingAmount = ethers.parseEther("5000");
        await testToken.connect(user1).approve(projectAddress, fundingAmount);
        await project.connect(user1).sendFunds(fundingAmount);
        await testToken.connect(contractor).approve(projectAddress, TOKEN_ARBITRATION_FEE / 2n);
        await project.connect(contractor).signContract();

        // Dispute it
        await project.connect(user1).voteToDispute();
        expect(await project.stage()).to.equal(3); // Dispute

        return project;
    }

    beforeEach(async function () {
        [deployer, timelock, registry, author, contractor, arbiter, user1, daoMember] = await ethers.getSigners();
        
        // Deploy implementations and core contracts
        const NativeProjectImpl = await ethers.getContractFactory("NativeProject");
        nativeProjectImpl = await NativeProjectImpl.deploy();
        const ERC20ProjectImpl = await ethers.getContractFactory("ERC20Project");
        erc20ProjectImpl = await ERC20ProjectImpl.deploy();
        const Economy = await ethers.getContractFactory("Economy");
        economy = await Economy.deploy();
        
        // Deploy mocks
        const TestToken = await ethers.getContractFactory("TestToken");
        testToken = await TestToken.deploy();
        const MockRepToken = await ethers.getContractFactory("MockRepToken");
        mockRepToken = await MockRepToken.deploy();
        const MockGovernor = await ethers.getContractFactory("MockGovernor");
        mockGovernor = await MockGovernor.deploy();

        // Link contracts
        await economy.connect(deployer).setImplementations(await nativeProjectImpl.getAddress(), await erc20ProjectImpl.getAddress());
        await economy.connect(deployer).setDaoAddresses(timelock.address, registry.address, await mockGovernor.getAddress(), await mockRepToken.getAddress());
        
        // Set DAO parameters
        await economy.connect(timelock).setNativeArbitrationFee(NATIVE_ARBITRATION_FEE);
        await economy.connect(timelock).setProjectThreshold(PROJECT_THRESHOLD);

        // Mint reputation to the author so they can create projects
        await mockRepToken.mint(author.address, PROJECT_THRESHOLD);

        // Distribute tokens
        await testToken.connect(deployer).transfer(author.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(contractor.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(user1.address, ethers.parseEther("10000"));
    });

    describe("Full Appeal Lifecycle", function() {
        let project;

        beforeEach(async function() {
            project = await setupDisputedProject();
        });

        it("should allow a valid DAO member to appeal and the DAO to overrule", async function() {
            // 1. Arbiter rules, moving to Appealable
            await project.connect(arbiter).arbitrate(60, "arbiter_ruling");
            expect(await project.stage()).to.equal(4); // Appealable

            // 2. Setup mocks for a valid appeal
            await mockRepToken.mint(daoMember.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1); // Active state

            // 3. DAO Member successfully appeals
            await project.connect(daoMember).appeal(123, [await project.getAddress()]);
            expect(await project.stage()).to.equal(5); // Appeal

            // 4. DAO Timelock overrules the arbiter
            const daoRuling = 25; // DAO is less generous
            await project.connect(timelock).daoOverrule(daoRuling, "dao_ruling");
            expect(await project.stage()).to.equal(6); // Closed

            // 5. Verify final state
            expect(await project.disputeResolution()).to.equal(daoRuling);
            expect(await project.ruling_hash()).to.equal("dao_ruling");
            
            // 6. Verify arbiter was still paid because they ruled
            expect(await testToken.balanceOf(arbiter.address)).to.equal(TOKEN_ARBITRATION_FEE);
        });

        it("should finalize the arbiter's ruling if the appeal initiation period expires", async function() {
            await project.connect(arbiter).arbitrate(70, "original_ruling");
            expect(await project.stage()).to.equal(4); // Appealable

            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);

            // Attempt to appeal should fail
            await mockRepToken.mint(daoMember.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1);
            await expect(project.connect(daoMember).appeal(123, [await project.getAddress()]))
                .to.be.revertedWith("Appeal initiation period has ended");

            // Anyone can now finalize
            await project.connect(user1).finalizeArbitration();
            expect(await project.stage()).to.equal(6); // Closed
            expect(await project.disputeResolution()).to.equal(70);
        });

        it("should finalize the arbiter's ruling if the DAO fails to act after an appeal", async function() {
            await project.connect(arbiter).arbitrate(80, "original_ruling");
            await mockRepToken.mint(daoMember.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1);
            await project.connect(daoMember).appeal(123, [await project.getAddress()]);
            expect(await project.stage()).to.equal(5); // Appeal

            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            
            // DAO tries to overrule too late
            await expect(project.connect(timelock).daoOverrule(10, "too_late"))
                .to.be.revertedWith("Appeal period has ended");

            // Finalize with original ruling
            await project.connect(user1).finalizeArbitration();
            expect(await project.stage()).to.equal(6); // Closed
            expect(await project.disputeResolution()).to.equal(80);
        });

        it("should prevent appeals from members with insufficient voting power", async function() {
            await project.connect(arbiter).arbitrate(50, "ruling");
            
            // Mint just under the required threshold
            await mockRepToken.mint(daoMember.address, PROJECT_THRESHOLD - 1n);
            await mockGovernor.setProposalState(1);

            await expect(project.connect(daoMember).appeal(123, [await project.getAddress()]))
                .to.be.revertedWith("Insufficient voting power to appeal");
        });
    });

    // NEW: Test suite for the inactive arbiter scenario
    describe("Arbiter Inactivity & Escalation", function() {
        let project;

        beforeEach(async function() {
            project = await setupDisputedProject();
        });

        it("should allow the DAO to escalate a dispute if the arbiter is inactive", async function() {
            // 1. Verify we are in the Dispute stage
            expect(await project.stage()).to.equal(3); // Dispute

            // 2. Fast-forward time past the arbiter's exclusive ruling window
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);

            // 3. Setup mocks for a valid appeal
            await mockRepToken.mint(daoMember.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1);

            // 4. DAO member successfully appeals from the Dispute stage
            await project.connect(daoMember).appeal(456, [await project.getAddress()]);
            expect(await project.stage()).to.equal(5); // Appeal

            // 5. DAO overrules and closes the project
            await project.connect(timelock).daoOverrule(10, "dao_intervention");
            expect(await project.stage()).to.equal(6); // Closed

            // 6. Verify the consequences of arbiter inactivity
            // Arbiter should NOT be paid
            expect(await testToken.balanceOf(arbiter.address)).to.equal(0);
            
            // The forfeited fee should be in the Economy contract
            const economyBalance = await testToken.balanceOf(await economy.getAddress());
            // Economy balance contains platform fees and now the forfeited fee
            expect(economyBalance).to.equal(TOKEN_ARBITRATION_FEE);
            
            // Author and Contractor should NOT be able to reclaim their fee
            await expect(project.connect(author).reclaimArbitrationFee())
                .to.be.revertedWith("The fee has been paid out to the Arbiter (because there was a dispute).");
        });

        it("should prevent the DAO from escalating a dispute within the arbiter's exclusive window", async function() {
            // 1. Verify we are in the Dispute stage
            expect(await project.stage()).to.equal(3);

            // 2. DO NOT fast-forward time. The arbiter is still within their window.
            await mockRepToken.mint(daoMember.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1);

            // 3. Attempting to appeal now must fail
            await expect(project.connect(daoMember).appeal(789, [await project.getAddress()]))
                .to.be.revertedWith("Appeal not allowed at this time");
        });
    });

    describe("Fund Handling Mechanisms", function() {
        it("should correctly handle direct ETH transfers via receive() in NativeProject", async function() {
            const tx = await economy.connect(author).createProject(
                "Native Receive Test", ethers.ZeroAddress, ethers.ZeroAddress, "t", "r", "d"
            );
            const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const project = await ethers.getContractAt("NativeProject", projectAddress);
            
            const fundingAmount = ethers.parseEther("2.5");
            const userBalanceBefore = await ethers.provider.getBalance(user1.address);
            
            const sendTx = await user1.sendTransaction({
                to: projectAddress,
                value: fundingAmount
            });
            await sendTx.wait();
            
            const sendReceipt = await ethers.provider.getTransactionReceipt(sendTx.hash);
            const gasUsed = sendReceipt.gasUsed * sendTx.gasPrice;
            
            expect(await project.projectValue()).to.equal(fundingAmount);
            expect(await project.contributors(user1.address)).to.equal(fundingAmount);
            expect(await ethers.provider.getBalance(user1.address)).to.equal(userBalanceBefore - fundingAmount - gasUsed);
        });

        it("should allow the DAO to sweep orphaned ERC20 tokens", async function() {
            const project = await setupDisputedProject();
            const projectAddress = await project.getAddress();
            const orphanedAmount = ethers.parseEther("123");

            // User accidentally sends tokens directly
            await testToken.connect(user1).transfer(projectAddress, orphanedAmount);

            const projectValue = await project.projectValue();
            const totalBalance = await testToken.balanceOf(projectAddress);
            const totalStaked = TOKEN_ARBITRATION_FEE;
            
            expect(totalBalance).to.be.gt(projectValue);
            expect(totalBalance).to.equal(projectValue + totalStaked + orphanedAmount);

            // A non-timelock account cannot sweep
            await expect(project.connect(author).sweepOrphanedTokens(await testToken.getAddress()))
                .to.be.revertedWith("Only the DAO Timelock can sweep tokens.");

            // Timelock sweeps the tokens to the Economy contract (acting as treasury receiver)
            const economyBalanceBefore = await testToken.balanceOf(await economy.getAddress());
            await project.connect(timelock).sweepOrphanedTokens(await testToken.getAddress());
            const economyBalanceAfter = await testToken.balanceOf(await economy.getAddress());

            // Verify balances and state
            expect(economyBalanceAfter).to.equal(economyBalanceBefore + orphanedAmount);
            expect(await testToken.balanceOf(projectAddress)).to.equal(projectValue + totalStaked);
            expect(await project.projectValue()).to.equal(projectValue); // Unchanged
        });
    });
});
// appeals.test.js```

```

### `test/dao-governance.test.js`
```js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAO-Governed Economy", function () {
    let economy, nativeProjectImpl, erc20ProjectImpl, testToken, mockRepToken;
    let deployer, timelock, registry, governor, author, contractor, arbiter, user1;

    // Constants
    const NATIVE_CURRENCY = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const INITIAL_NATIVE_ARBITRATION_FEE = ethers.parseEther("0.1");
    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");

    beforeEach(async function () {
        [deployer, timelock, registry, governor, author, contractor, arbiter, user1] = await ethers.getSigners();

        // 1. Deploy Implementations
        const NativeProjectImpl = await ethers.getContractFactory("NativeProject");
        nativeProjectImpl = await NativeProjectImpl.deploy();
        
        const ERC20ProjectImpl = await ethers.getContractFactory("ERC20Project");
        erc20ProjectImpl = await ERC20ProjectImpl.deploy();

        // 2. Deploy Economy Contract
        const Economy = await ethers.getContractFactory("Economy");
        economy = await Economy.deploy();

        // 3. Deploy Mock ERC20 and Rep Tokens
        const TestToken = await ethers.getContractFactory("TestToken");
        testToken = await TestToken.deploy();
        const MockRepToken = await ethers.getContractFactory("MockRepToken");
        mockRepToken = await MockRepToken.deploy();
        
        // 4. Link everything together
        await economy.connect(deployer).setImplementations(
            await nativeProjectImpl.getAddress(),
            await erc20ProjectImpl.getAddress()
        );

        // This simulates the DAO factory setting up the economy
        await economy.connect(deployer).setDaoAddresses(
            timelock.address,
            registry.address,
            governor.address,
            await mockRepToken.getAddress() // Use the deployed mock contract
        );

        // Set an initial native arbitration fee for project creation
        await economy.connect(timelock).setNativeArbitrationFee(INITIAL_NATIVE_ARBITRATION_FEE);

        // Distribute test tokens
        await testToken.connect(deployer).transfer(author.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(contractor.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(user1.address, ethers.parseEther("10000"));
    });

    describe("Deployment & Setup", function () {
        it("should correctly set the DAO addresses", async function () {
            expect(await economy.timelockAddress()).to.equal(timelock.address);
            expect(await economy.registryAddress()).to.equal(registry.address);
            expect(await economy.governorAddress()).to.equal(governor.address);
            expect(await economy.repTokenAddress()).to.equal(await mockRepToken.getAddress());
        });

        it("should prevent setting DAO addresses more than once", async function () {
            await expect(
                economy.connect(deployer).setDaoAddresses(timelock.address, registry.address, governor.address, await mockRepToken.getAddress())
            ).to.be.revertedWith("DAO addresses can only be set once.");
        });
    });

    describe("DAO Parameter Governance", function () {
        it("should allow the DAO Timelock to set parameters", async function () {
            const newPlatformFee = 250; // 2.5%
            await expect(economy.connect(timelock).setPlatformFee(newPlatformFee))
                .to.emit(economy, "PlatformFeeSet").withArgs(newPlatformFee);
            expect(await economy.platformFeeBps()).to.equal(newPlatformFee);

            const newQuorum = 6000; // 60%
            await expect(economy.connect(timelock).setBackersVoteQuorum(newQuorum))
                .to.emit(economy, "BackersVoteQuorumSet").withArgs(newQuorum);
            expect(await economy.backersVoteQuorumBps()).to.equal(newQuorum);
        });

        it("should prevent non-Timelock addresses from setting parameters", async function () {
            await expect(economy.connect(author).setPlatformFee(200))
                .to.be.revertedWith("Only DAO Timelock can call");
            
            await expect(economy.connect(deployer).setNativeArbitrationFee(ethers.parseEther("1")))
                .to.be.revertedWith("Only DAO Timelock can call");
        });
    });

    describe("Project Creation & DAO Awareness", function() {
        it("should inject DAO addresses into new NativeProject clones", async function() {
            const tx = await economy.connect(author).createProject(
                "Native Test", contractor.address, arbiter.address, "terms", "repo", "desc",
                { value: INITIAL_NATIVE_ARBITRATION_FEE / 2n }
            );
            const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const project = await ethers.getContractAt("NativeProject", projectAddress);

            expect(await project.daoTimelock()).to.equal(timelock.address);
            expect(await project.daoGovernor()).to.equal(governor.address);
        });

        it("should correctly read a DAO-governed parameter (quorum)", async function() {
             // 1. DAO sets a custom quorum
            await economy.connect(timelock).setBackersVoteQuorum(8500); // 85% quorum

            // 2. Create and fund project
            const tx = await economy.connect(author).createProject(
                "Quorum Test", contractor.address, arbiter.address, "terms", "repo", "desc",
                { value: INITIAL_NATIVE_ARBITRATION_FEE / 2n }
            );
            const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const project = await ethers.getContractAt("NativeProject", projectAddress);
            
            await project.connect(user1).sendFunds({ value: ethers.parseEther("10") });
            await project.connect(contractor).signContract({ value: INITIAL_NATIVE_ARBITRATION_FEE / 2n });

            // 3. Vote to release payment. With 100% of the vote, it should pass the 85% threshold.
            await project.connect(user1).voteToReleasePayment();

            // 4. Verify stage changed to Closed
            // MODIFIED: The 'Closed' stage enum is now 6.
            expect(await project.stage()).to.equal(6); // 6 = Closed
        });
    });

    describe("DAO Veto Functionality", function() {
        it("should allow the DAO Timelock to veto an ongoing project", async function() {
            // 1. Create and fund a project
            const economyAddr = await economy.getAddress();
            await testToken.connect(author).approve(economyAddr, TOKEN_ARBITRATION_FEE / 2n);
            const tx = await economy.connect(author).createERC20Project(
                "Veto Test", contractor.address, arbiter.address, "terms", "repo", "desc",
                await testToken.getAddress(), TOKEN_ARBITRATION_FEE
            );
             const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const project = await ethers.getContractAt("ERC20Project", projectAddress);

            const fundingAmount = ethers.parseEther("500");
            await testToken.connect(user1).approve(projectAddress, fundingAmount);
            await project.connect(user1).sendFunds(fundingAmount);
            
            await testToken.connect(contractor).approve(projectAddress, TOKEN_ARBITRATION_FEE / 2n);
            await project.connect(contractor).signContract();
            expect(await project.stage()).to.equal(2); // Ongoing

            // 2. Veto the project
            await expect(project.connect(timelock).daoVeto())
                .to.emit(project, "VetoedByDao").withArgs(timelock.address);
            
            // 3. Verify state
            // MODIFIED: The 'Closed' stage enum is now 6.
            expect(await project.stage()).to.equal(6); // Closed
            
            expect(await project.disputeResolution()).to.equal(0);

            // 4. Verify user can get a full refund
            const userBalanceBefore = await testToken.balanceOf(user1.address);
            await project.connect(user1).withdrawAsContributor();
            const userBalanceAfter = await testToken.balanceOf(user1.address);
            expect(userBalanceAfter).to.equal(userBalanceBefore + fundingAmount);
        });

        it("should prevent non-Timelock addresses from vetoing", async function() {
            const tx = await economy.connect(author).createProject(
                "No Veto Test", contractor.address, arbiter.address, "terms", "repo", "desc",
                { value: INITIAL_NATIVE_ARBITRATION_FEE / 2n }
            );
            const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const project = await ethers.getContractAt("NativeProject", projectAddress);

            await expect(project.connect(author).daoVeto())
                .to.be.revertedWith("Only the DAO Timelock can veto a project.");
        });
    });

    describe("Token-Aware Accounting & getUser", function() {
        it("should correctly record native and ERC20 earnings and be retrievable via getUser", async function() {
            // --- Phase 1: Native Project ---
            const nativeFunding = ethers.parseEther("10");
            const nativeTx = await economy.connect(author).createProject(
                "Native Accounting", contractor.address, arbiter.address, "t", "r", "d",
                { value: INITIAL_NATIVE_ARBITRATION_FEE / 2n }
            );
            const nativeReceipt = await nativeTx.wait();
            const nativeProjectAddr = nativeReceipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const nativeProject = await ethers.getContractAt("NativeProject", nativeProjectAddr);

            await nativeProject.connect(user1).sendFunds({ value: nativeFunding });
            await nativeProject.connect(contractor).signContract({ value: INITIAL_NATIVE_ARBITRATION_FEE / 2n });
            await nativeProject.connect(user1).voteToReleasePayment();
            await nativeProject.connect(contractor).withdrawAsContractor();

            // --- Phase 2: ERC20 Project ---
            const tokenFunding = ethers.parseEther("1000");
            const economyAddr = await economy.getAddress();
            const tokenAddr = await testToken.getAddress();
            await testToken.connect(author).approve(economyAddr, TOKEN_ARBITRATION_FEE / 2n);
            const erc20Tx = await economy.connect(author).createERC20Project(
                "ERC20 Accounting", contractor.address, arbiter.address, "t", "r", "d",
                tokenAddr, TOKEN_ARBITRATION_FEE
            );
            const erc20Receipt = await erc20Tx.wait();
            const erc20ProjectAddr = erc20Receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            const erc20Project = await ethers.getContractAt("ERC20Project", erc20ProjectAddr);

            await testToken.connect(user1).approve(erc20ProjectAddr, tokenFunding);
            await erc20Project.connect(user1).sendFunds(tokenFunding);
            await testToken.connect(contractor).approve(erc20ProjectAddr, TOKEN_ARBITRATION_FEE / 2n);
            await erc20Project.connect(contractor).signContract();
            await erc20Project.connect(user1).voteToReleasePayment();
            await erc20Project.connect(contractor).withdrawAsContractor();

            // --- Phase 3: Verification ---
            const contractorProfile = await economy.getUser(contractor.address);
            
            const platformFeeBps = await economy.platformFeeBps();
            const authorFeeBps = await economy.authorFeeBps();
            
            const nativePlatformFee = (nativeFunding * platformFeeBps) / 10000n;
            const nativeAuthorFee = ((nativeFunding - nativePlatformFee) * authorFeeBps) / 10000n;
            const expectedNativeEarning = nativeFunding - nativePlatformFee - nativeAuthorFee;

            const tokenPlatformFee = (tokenFunding * platformFeeBps) / 10000n;
            const tokenAuthorFee = ((tokenFunding - tokenPlatformFee) * authorFeeBps) / 10000n;
            const expectedTokenEarning = tokenFunding - tokenPlatformFee - tokenAuthorFee;

            expect(contractorProfile.earnedTokens).to.have.lengthOf(2);
            expect(contractorProfile.earnedAmounts).to.have.lengthOf(2);
            expect(contractorProfile.earnedTokens).to.include(NATIVE_CURRENCY);
            expect(contractorProfile.earnedTokens).to.include(tokenAddr);

            const nativeIndex = contractorProfile.earnedTokens.indexOf(NATIVE_CURRENCY);
            const tokenIndex = contractorProfile.earnedTokens.indexOf(tokenAddr);

            expect(contractorProfile.earnedAmounts[nativeIndex]).to.equal(expectedNativeEarning);
            expect(contractorProfile.earnedAmounts[tokenIndex]).to.equal(expectedTokenEarning);

            expect(contractorProfile.projectsAsContractor).to.have.lengthOf(2);
            expect(contractorProfile.projectsAsContractor).to.include(nativeProjectAddr);
            expect(contractorProfile.projectsAsContractor).to.include(erc20ProjectAddr);
        });
    });
});
// dao-governance.test.js
```

### `test/project-lifecycle.test.js`
```js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Project Lifecycle under DAO Governance", function () {
    let economy, nativeProjectImpl, erc20ProjectImpl, testToken, mockRepToken;
    let deployer, timelock, registry, governor, author, contractor, arbiter, user1, user2;

    const NATIVE_CURRENCY = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const NATIVE_ARBITRATION_FEE = ethers.parseEther("0.1");
    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");

    // Helper function to create a new project, handling both native and ERC20 cases
    async function createProject(isNative, parties = {}) {
        const _author = parties.author || author;
        const _contractor = parties.contractor || contractor;
        const _arbiter = parties.arbiter || arbiter;

        if (isNative) {
            const tx = await economy.connect(_author).createProject(
                "Native Project", _contractor.address, _arbiter.address, "terms", "repo", "desc",
                { value: NATIVE_ARBITRATION_FEE / 2n }
            );
            const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            return ethers.getContractAt("NativeProject", projectAddress);
        } else {
            const economyAddr = await economy.getAddress();
            await testToken.connect(_author).approve(economyAddr, TOKEN_ARBITRATION_FEE / 2n);
            const tx = await economy.connect(_author).createERC20Project(
                "ERC20 Project", _contractor.address, _arbiter.address, "terms", "repo", "desc",
                await testToken.getAddress(), TOKEN_ARBITRATION_FEE
            );
            const receipt = await tx.wait();
            const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
            return ethers.getContractAt("ERC20Project", projectAddress);
        }
    }

    beforeEach(async function () {
        [deployer, timelock, registry, governor, author, contractor, arbiter, user1, user2] = await ethers.getSigners();
        
        const NativeProjectImpl = await ethers.getContractFactory("NativeProject");
        nativeProjectImpl = await NativeProjectImpl.deploy();
        const ERC20ProjectImpl = await ethers.getContractFactory("ERC20Project");
        erc20ProjectImpl = await ERC20ProjectImpl.deploy();
        const Economy = await ethers.getContractFactory("Economy");
        economy = await Economy.deploy();
        const TestToken = await ethers.getContractFactory("TestToken");
        testToken = await TestToken.deploy();
        const MockRepToken = await ethers.getContractFactory("MockRepToken");
        mockRepToken = await MockRepToken.deploy();
        
        await economy.connect(deployer).setImplementations(await nativeProjectImpl.getAddress(), await erc20ProjectImpl.getAddress());
        await economy.connect(deployer).setDaoAddresses(timelock.address, registry.address, governor.address, await mockRepToken.getAddress());
        await economy.connect(timelock).setNativeArbitrationFee(NATIVE_ARBITRATION_FEE);
        
        await testToken.connect(deployer).transfer(author.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(contractor.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(user1.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(user2.address, ethers.parseEther("10000"));
    });

    describe("Happy Path Workflow (ERC20 Project)", function() {
        let project;
        const fundingAmount = ethers.parseEther("1000");

        it("should allow a project to proceed from creation to successful withdrawal", async function() {
            // 1. Create Project (Pending stage)
            project = await createProject(false); // ERC20
            expect(await project.stage()).to.equal(1); // Pending

            // 2. Fund Project
            await testToken.connect(user1).approve(await project.getAddress(), fundingAmount);
            await project.connect(user1).sendFunds(fundingAmount);
            expect(await project.projectValue()).to.equal(fundingAmount);

            // 3. Contractor signs (Ongoing stage)
            await testToken.connect(contractor).approve(await project.getAddress(), TOKEN_ARBITRATION_FEE / 2n);
            await project.connect(contractor).signContract();
            expect(await project.stage()).to.equal(2); // Ongoing

            // 4. Backers vote to release funds (Closed stage)
            await project.connect(user1).voteToReleasePayment();
            expect(await project.stage()).to.equal(6); // Closed
            expect(await project.fundsReleased()).to.be.true;
            expect(await project.disputeResolution()).to.equal(0);

            // 5. Contractor withdraws payment
            const contractorBalanceBefore = await testToken.balanceOf(contractor.address);
            const authorBalanceBefore = await testToken.balanceOf(author.address);
            
            await project.connect(contractor).withdrawAsContractor();
            
            const platformFee = fundingAmount / 100n; // 1%
            const authorFee = (fundingAmount - platformFee) / 100n; // 1% of remainder
            const expectedContractorPayout = fundingAmount - platformFee - authorFee;

            expect(await testToken.balanceOf(contractor.address)).to.equal(contractorBalanceBefore + expectedContractorPayout);
            expect(await testToken.balanceOf(author.address)).to.equal(authorBalanceBefore + authorFee);

            // 6. Verify earnings were recorded in Economy
            const contractorProfile = await economy.getUser(contractor.address);
            const authorProfile = await economy.getUser(author.address);
            const tokenAddr = await testToken.getAddress();
            
            expect(contractorProfile.earnedTokens[0]).to.equal(tokenAddr);
            expect(contractorProfile.earnedAmounts[0]).to.equal(expectedContractorPayout);
            expect(authorProfile.earnedTokens[0]).to.equal(tokenAddr);
            expect(authorProfile.earnedAmounts[0]).to.equal(authorFee);
            
            // 7. Parties reclaim their arbitration fees
            const authorFeeBalanceBefore = await testToken.balanceOf(author.address);
            await project.connect(author).reclaimArbitrationFee();
            expect(await testToken.balanceOf(author.address)).to.equal(authorFeeBalanceBefore + TOKEN_ARBITRATION_FEE / 2n);

            const contractorFeeBalanceBefore = await testToken.balanceOf(contractor.address);
            await project.connect(contractor).reclaimArbitrationFee();
            expect(await testToken.balanceOf(contractor.address)).to.equal(contractorFeeBalanceBefore + TOKEN_ARBITRATION_FEE / 2n);
        });
    });

    describe("Dispute Path Workflow (Native Project)", function() {
        let project;
        const fundingAmount = ethers.parseEther("10");
        const arbiterPayoutPercent = 60; // Arbiter rules 60% in favor of contractor

        it("should correctly handle a dispute, arbitration, and partial withdrawals", async function() {
            // 1. Create and fund project
            project = await createProject(true); // Native
            await project.connect(user1).sendFunds({ value: fundingAmount });
            await project.connect(contractor).signContract({ value: NATIVE_ARBITRATION_FEE / 2n });
            expect(await project.stage()).to.equal(2); // Ongoing

            // 2. Backers vote to dispute (Dispute stage)
            await project.connect(user1).voteToDispute();
            expect(await project.stage()).to.equal(3); // Dispute

            // 3. Arbiter makes a ruling (Appealable stage)
            const arbiterBalanceBefore = await ethers.provider.getBalance(arbiter.address);
            const arbitrateTx = await project.connect(arbiter).arbitrate(arbiterPayoutPercent, "ruling_hash");
            const arbitrateReceipt = await arbitrateTx.wait();
            const arbitrateGasUsed = arbitrateReceipt.gasUsed * arbitrateTx.gasPrice;
            
            expect(await project.stage()).to.equal(4); // Appealable
            expect(await project.originalDisputeResolution()).to.equal(arbiterPayoutPercent);
            
            // 4. Simulate appeal period ending without a DAO appeal, then finalize
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.connect(user1).finalizeArbitration();

            // 5. Verify final state (Closed)
            expect(await project.stage()).to.equal(6); // Closed
            expect(await project.disputeResolution()).to.equal(arbiterPayoutPercent);
            // MODIFIED: Account for gas spent by arbiter to submit their ruling.
            expect(await ethers.provider.getBalance(arbiter.address)).to.equal(arbiterBalanceBefore - arbitrateGasUsed + NATIVE_ARBITRATION_FEE);
            
            // 6. Contractor withdraws their partial payment
            const expectedContractorShare = (fundingAmount * BigInt(arbiterPayoutPercent)) / 100n;
            const platformFee = expectedContractorShare / 100n;
            const authorFee = (expectedContractorShare - platformFee) / 100n;
            
            await project.connect(contractor).withdrawAsContractor();
            
            // 7. Contributor withdraws their remaining funds
            const userBalanceBefore = await ethers.provider.getBalance(user1.address);
            const expectedUserRefund = fundingAmount - expectedContractorShare;

            const withdrawTx = await project.connect(user1).withdrawAsContributor();
            const withdrawReceipt = await withdrawTx.wait();
            const withdrawGas = withdrawReceipt.gasUsed * withdrawTx.gasPrice;

            expect(await ethers.provider.getBalance(user1.address)).to.equal(userBalanceBefore + expectedUserRefund - withdrawGas);
            
            // 8. Verify spendings were recorded in Economy
            const userProfile = await economy.getUser(user1.address);
            const expectedExpenditure = fundingAmount - expectedUserRefund;
            expect(userProfile.spentTokens[0]).to.equal(NATIVE_CURRENCY);
            expect(userProfile.spentAmounts[0]).to.equal(expectedExpenditure);
        });
    });

    describe("Alternative & Edge Cases", function() {
        it("should allow a contributor to withdraw funds before a contract is signed", async function() {
            const project = await createProject(false); // ERC20
            const fundingAmount = ethers.parseEther("250");
            await testToken.connect(user1).approve(await project.getAddress(), fundingAmount);
            await project.connect(user1).sendFunds(fundingAmount);
            
            const userBalanceBefore = await testToken.balanceOf(user1.address);
            await project.connect(user1).withdrawAsContributor();
            expect(await testToken.balanceOf(user1.address)).to.equal(userBalanceBefore + fundingAmount);
        });

        it("should correctly handle a contributor switching their vote from Dispute to Release", async function() {
            const project = await createProject(false); // ERC20
            const amount1 = ethers.parseEther("300"); // 30%
            const amount2 = ethers.parseEther("700"); // 70%
            await testToken.connect(user1).approve(await project.getAddress(), amount1);
            await project.connect(user1).sendFunds(amount1);
            await testToken.connect(user2).approve(await project.getAddress(), amount2);
            await project.connect(user2).sendFunds(amount2);

            await testToken.connect(contractor).approve(await project.getAddress(), TOKEN_ARBITRATION_FEE / 2n);
            await project.connect(contractor).signContract();

            // 1. Minority user (user1) votes to dispute. Quorum is not met.
            await project.connect(user1).voteToDispute();
            expect(await project.stage()).to.equal(2); // Still Ongoing
            expect(await project.totalVotesForDispute()).to.equal(amount1);
            expect(await project.totalVotesForRelease()).to.equal(0);

            // 2. Minority user (user1) switches their vote to release.
            await project.connect(user1).voteToReleasePayment();
            expect(await project.stage()).to.equal(2); // Still Ongoing
            expect(await project.totalVotesForDispute()).to.equal(0);
            expect(await project.totalVotesForRelease()).to.equal(amount1);

            // 3. Majority user (user2) also votes to release, pushing the vote over the 70% quorum.
            await project.connect(user2).voteToReleasePayment();
            expect(await project.stage()).to.equal(6); // Now Closed
            expect(await project.totalVotesForRelease()).to.equal(amount1 + amount2);
        });

        it("should enforce the projectThreshold for creating projects", async function() {
            const threshold = ethers.parseEther("10");
            await economy.connect(timelock).setProjectThreshold(threshold);
            
            // This should fail, author has no RepTokens
            await expect(createProject(true)).to.be.revertedWith("Insufficient reputation to create a project");

            // Mint some mock rep tokens to the author
            await mockRepToken.connect(deployer).mint(author.address, threshold);
            
            // This should now succeed
            await expect(createProject(true)).to.not.be.reverted;
        });
    });
});
// project-lifecycle.test.js
```
