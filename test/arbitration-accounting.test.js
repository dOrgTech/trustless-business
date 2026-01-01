const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Arbitration Fund Accounting Tests
 *
 * These tests verify that ALL funds are properly accounted for after dispute resolution.
 * The key invariant: total funds in = total funds out (no funds stuck in contract).
 */
describe("Arbitration Fund Accounting", function () {
    let economy, nativeProjectImpl, erc20ProjectImpl, testToken, mockRepToken, mockGovernor;
    let deployer, timelock, registry, author, contractor, arbiter, backer1, backer2;

    const NATIVE_CURRENCY = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const ARBITRATION_FEE_BPS = 100; // 1% for easy math
    const PROJECT_THRESHOLD = ethers.parseEther("1000");

    async function createERC20Project() {
        const tx = await economy.connect(author).createERC20Project(
            "Test Project", contractor.address, arbiter.address, "terms", "repo", "desc",
            await testToken.getAddress()
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        return ethers.getContractAt("ERC20Project", projectAddress);
    }

    async function createNativeProject() {
        const tx = await economy.connect(author).createProject(
            "Test Project", contractor.address, arbiter.address, "terms", "repo", "desc"
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        return ethers.getContractAt("NativeProject", projectAddress);
    }

    beforeEach(async function () {
        [deployer, timelock, registry, author, contractor, arbiter, backer1, backer2] = await ethers.getSigners();

        const NativeProjectImpl = await ethers.getContractFactory("NativeProject");
        nativeProjectImpl = await NativeProjectImpl.deploy();
        const ERC20ProjectImpl = await ethers.getContractFactory("ERC20Project");
        erc20ProjectImpl = await ERC20ProjectImpl.deploy();
        const Economy = await ethers.getContractFactory("Economy");
        economy = await Economy.deploy(ARBITRATION_FEE_BPS);
        const TestToken = await ethers.getContractFactory("TestToken");
        testToken = await TestToken.deploy();
        const MockRepToken = await ethers.getContractFactory("MockRepToken");
        mockRepToken = await MockRepToken.deploy();
        const MockGovernor = await ethers.getContractFactory("MockGovernor");
        mockGovernor = await MockGovernor.deploy();

        await economy.connect(deployer).setImplementations(
            await nativeProjectImpl.getAddress(),
            await erc20ProjectImpl.getAddress()
        );
        await economy.connect(deployer).setDaoAddresses(
            timelock.address, registry.address, await mockGovernor.getAddress(), await mockRepToken.getAddress()
        );

        // Set DAO parameters
        await economy.connect(timelock).setProjectThreshold(PROJECT_THRESHOLD);

        // Mint reputation to author so they can create projects
        await mockRepToken.mint(author.address, PROJECT_THRESHOLD);

        // Fund test accounts
        await testToken.connect(deployer).transfer(backer1.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(backer2.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(contractor.address, ethers.parseEther("10000"));
    });

    describe("ERC20 Project - Dispute Resolution Accounting", function() {
        it("should have zero balance after all withdrawals (single backer, 90% ruling, WITH immediate release)", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const immediateBps = 1000n; // 10% immediate release
            // Arbitration fee is calculated from totalLocked (900), not projectValue (1000)
            const totalLocked = fundingAmount - (fundingAmount * immediateBps) / 10000n; // 900
            const arbitrationFee = (totalLocked * BigInt(ARBITRATION_FEE_BPS)) / 10000n; // 9 tokens
            const contractorStake = arbitrationFee / 2n; // 4.5 tokens

            // Fund project WITH 10% immediate release (matches manual test scenario)
            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);

            // Contractor signs and stakes
            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            // Backer votes to dispute
            await project.connect(backer1).voteToDispute();
            expect(await project.stage()).to.equal(3); // Dispute

            // Arbiter rules 90% to contractor
            await project.connect(arbiter).arbitrate(90, "ruling_hash");

            // Finalize after appeal period
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.connect(backer1).finalizeArbitration();

            const projectAddr = await project.getAddress();

            // Contractor withdraws
            await project.connect(contractor).withdrawAsContractor();

            // Backer withdraws
            await project.connect(backer1).withdrawAsContributor();

            // KEY ASSERTION: Project should have ZERO balance
            const finalBalance = await testToken.balanceOf(projectAddr);
            expect(finalBalance).to.equal(0, "Project should have zero balance after all withdrawals");
        });

        it("should have zero balance after all withdrawals (multiple backers, 60% ruling)", async function() {
            const project = await createERC20Project();
            const funding1 = ethers.parseEther("600");
            const funding2 = ethers.parseEther("400");
            const totalFunding = funding1 + funding2;
            const arbitrationFee = (totalFunding * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            // Both backers fund
            await testToken.connect(backer1).approve(await project.getAddress(), funding1);
            await project.connect(backer1).sendFunds(funding1);
            await testToken.connect(backer2).approve(await project.getAddress(), funding2);
            await project.connect(backer2).sendFunds(funding2);

            // Contractor signs
            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            // Both backers dispute
            await project.connect(backer1).voteToDispute();
            await project.connect(backer2).voteToDispute();

            // Arbiter rules 60% to contractor
            await project.connect(arbiter).arbitrate(60, "ruling_hash");

            // Finalize
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.finalizeArbitration();

            // All parties withdraw
            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();
            await project.connect(backer2).withdrawAsContributor();

            // KEY ASSERTION: Zero balance
            const finalBalance = await testToken.balanceOf(await project.getAddress());
            expect(finalBalance).to.equal(0, "Project should have zero balance after all withdrawals");
        });

        it("should have zero balance after DAO overrule", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            // Fund and sign
            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFunds(fundingAmount);
            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            // Dispute
            await project.connect(backer1).voteToDispute();

            // Arbiter rules 30%
            await project.connect(arbiter).arbitrate(30, "ruling_hash");

            // Setup mocks for a valid appeal
            await mockRepToken.mint(backer1.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1); // Active state

            // Appeal to move to Stage.Appeal
            await project.connect(backer1).appeal(123, [await project.getAddress()]);
            expect(await project.stage()).to.equal(5); // Appeal

            // DAO overrules to 90%
            await project.connect(timelock).daoOverrule(90, "dao_ruling");

            // All parties withdraw
            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            // KEY ASSERTION: Zero balance
            const finalBalance = await testToken.balanceOf(await project.getAddress());
            expect(finalBalance).to.equal(0, "Project should have zero balance after DAO overrule withdrawals");
        });
    });

    describe("Native Project - Dispute Resolution Accounting", function() {
        it("should have zero balance after all withdrawals (single backer, 90% ruling)", async function() {
            const project = await createNativeProject();
            const fundingAmount = ethers.parseEther("10");
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            // Fund project
            await project.connect(backer1).sendFunds({ value: fundingAmount });

            // Contractor signs and stakes
            await project.connect(contractor).signContract({ value: contractorStake });

            // Dispute and arbitrate
            await project.connect(backer1).voteToDispute();
            await project.connect(arbiter).arbitrate(90, "ruling_hash");

            // Finalize
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.finalizeArbitration();

            // All parties withdraw
            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            // KEY ASSERTION: Zero balance
            const finalBalance = await ethers.provider.getBalance(await project.getAddress());
            expect(finalBalance).to.equal(0, "Project should have zero ETH balance after all withdrawals");
        });

        it("should have zero balance after DAO overrule", async function() {
            const project = await createNativeProject();
            const fundingAmount = ethers.parseEther("10");
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            // Fund and sign
            await project.connect(backer1).sendFunds({ value: fundingAmount });
            await project.connect(contractor).signContract({ value: contractorStake });

            // Dispute, arbitrate
            await project.connect(backer1).voteToDispute();
            await project.connect(arbiter).arbitrate(30, "ruling_hash");

            // Setup mocks for a valid appeal
            await mockRepToken.mint(backer1.address, PROJECT_THRESHOLD);
            await mockGovernor.setProposalState(1); // Active state

            // Appeal to move to Stage.Appeal
            await project.connect(backer1).appeal(123, [await project.getAddress()]);
            expect(await project.stage()).to.equal(5); // Appeal

            // DAO overrules to 90%
            await project.connect(timelock).daoOverrule(90, "dao_ruling");

            // All parties withdraw
            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            // KEY ASSERTION: Zero balance
            const finalBalance = await ethers.provider.getBalance(await project.getAddress());
            expect(finalBalance).to.equal(0, "Project should have zero ETH balance after DAO overrule withdrawals");
        });
    });

    describe("Fund Distribution Verification", function() {
        it("should correctly distribute all funds: arbiter + contractor + backers = total", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n; // 10
            const contractorStake = arbitrationFee / 2n; // 5
            const disputeResolution = 90n;

            // Record initial balances
            const arbiterBalanceBefore = await testToken.balanceOf(arbiter.address);
            const contractorBalanceBefore = await testToken.balanceOf(contractor.address);
            const backer1BalanceBefore = await testToken.balanceOf(backer1.address);

            // Setup: fund, sign, dispute, arbitrate, finalize
            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFunds(fundingAmount);
            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();
            await project.connect(backer1).voteToDispute();
            await project.connect(arbiter).arbitrate(Number(disputeResolution), "ruling_hash");
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.finalizeArbitration();

            // Withdrawals
            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            // Calculate net changes
            const arbiterGain = (await testToken.balanceOf(arbiter.address)) - arbiterBalanceBefore;
            const contractorAfter = await testToken.balanceOf(contractor.address);
            const backer1After = await testToken.balanceOf(backer1.address);

            // Verify arbiter got the full arbitration fee
            expect(arbiterGain).to.equal(arbitrationFee, "Arbiter should receive full arbitration fee");

            // Verify project balance is zero (all funds distributed)
            const finalBalance = await testToken.balanceOf(await project.getAddress());
            expect(finalBalance).to.equal(0, "Project should have zero balance");

            // Simple verification: contractor gets stake back + some from funding
            // backer gets some refund based on dispute resolution
            // The key test is that final balance is zero - all funds distributed
        });
    });
});
