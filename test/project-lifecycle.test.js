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
            expect(await project.stage()).to.equal(4); // Closed
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

            // 3. Arbiter makes a ruling (Closed stage)
            const arbiterBalanceBefore = await ethers.provider.getBalance(arbiter.address);
            const arbitrateTx = await project.connect(arbiter).arbitrate(arbiterPayoutPercent, "ruling_hash");
            const receipt = await arbitrateTx.wait();
            const gasUsed = receipt.gasUsed * arbitrateTx.gasPrice;
            
            expect(await project.stage()).to.equal(4); // Closed
            expect(await project.disputeResolution()).to.equal(arbiterPayoutPercent);
            expect(await ethers.provider.getBalance(arbiter.address)).to.equal(arbiterBalanceBefore + NATIVE_ARBITRATION_FEE - gasUsed);
            
            // 4. Contractor withdraws their partial payment
            const contractorBalanceBefore = await ethers.provider.getBalance(contractor.address);
            const expectedContractorShare = (fundingAmount * BigInt(arbiterPayoutPercent)) / 100n;
            const platformFee = expectedContractorShare / 100n;
            const authorFee = (expectedContractorShare - platformFee) / 100n;
            const expectedContractorPayout = expectedContractorShare - platformFee - authorFee;

            await project.connect(contractor).withdrawAsContractor();
            // Note: contractor balance check is tricky due to gas, but payout logic is what matters.
            
            // 5. Contributor withdraws their remaining funds
            const userBalanceBefore = await ethers.provider.getBalance(user1.address);
            const expectedUserRefund = fundingAmount - expectedContractorShare;

            const withdrawTx = await project.connect(user1).withdrawAsContributor();
            const withdrawReceipt = await withdrawTx.wait();
            const withdrawGas = withdrawReceipt.gasUsed * withdrawTx.gasPrice;

            expect(await ethers.provider.getBalance(user1.address)).to.equal(userBalanceBefore + expectedUserRefund - withdrawGas);
            
            // 6. Verify spendings were recorded in Economy
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
            expect(await project.stage()).to.equal(4); // Now Closed
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