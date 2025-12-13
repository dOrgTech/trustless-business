const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Immediate Release Feature", function () {
    let economy, nativeProjectImpl, erc20ProjectImpl, testToken, mockRepToken;
    let deployer, timelock, registry, governor, author, contractor, arbiter, backer1, backer2;

    const NATIVE_CURRENCY = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const ARBITRATION_FEE_BPS = 500; // 5%
    const MAX_IMMEDIATE_BPS = 2000; // 20%

    async function createNativeProject() {
        const tx = await economy.connect(author).createProject(
            "Test Project", contractor.address, arbiter.address, "terms", "repo", "desc"
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        return ethers.getContractAt("NativeProject", projectAddress);
    }

    async function createERC20Project() {
        const tx = await economy.connect(author).createERC20Project(
            "Test ERC20 Project", contractor.address, arbiter.address, "terms", "repo", "desc",
            await testToken.getAddress()
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        return ethers.getContractAt("ERC20Project", projectAddress);
    }

    beforeEach(async function () {
        [deployer, timelock, registry, governor, author, contractor, arbiter, backer1, backer2] = await ethers.getSigners();

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

        await economy.connect(deployer).setImplementations(await nativeProjectImpl.getAddress(), await erc20ProjectImpl.getAddress());
        await economy.connect(deployer).setDaoAddresses(timelock.address, registry.address, governor.address, await mockRepToken.getAddress());

        // Fund test accounts
        await testToken.connect(deployer).transfer(author.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(contractor.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(backer1.address, ethers.parseEther("10000"));
        await testToken.connect(deployer).transfer(backer2.address, ethers.parseEther("10000"));
    });

    describe("Economy Configuration", function () {
        it("should have default maxImmediateBps of 2000 (20%)", async function () {
            expect(await economy.maxImmediateBps()).to.equal(2000);
        });

        it("should allow DAO to change maxImmediateBps", async function () {
            await economy.connect(timelock).setMaxImmediateBps(1500);
            expect(await economy.maxImmediateBps()).to.equal(1500);
        });

        it("should prevent setting maxImmediateBps above 50%", async function () {
            await expect(economy.connect(timelock).setMaxImmediateBps(5001))
                .to.be.revertedWith("Max immediate cannot exceed 50%");
        });

        it("should include maxImmediateBps in getConfig", async function () {
            const config = await economy.getConfig();
            expect(config.maxImmediateBps).to.equal(2000);
        });
    });

    describe("Native Project - Immediate Release", function () {
        let project;
        const fundingAmount = ethers.parseEther("100");

        describe("sendFundsWithImmediate", function () {
            beforeEach(async function () {
                project = await createNativeProject();
            });

            it("should accept funding with immediate percentage", async function () {
                await project.connect(backer1).sendFundsWithImmediate(1000, { value: fundingAmount }); // 10%

                const contrib = await project.contributions(backer1.address);
                expect(contrib.total).to.equal(fundingAmount);
                expect(contrib.immediateBps).to.equal(1000);

                expect(await project.totalImmediate()).to.equal(fundingAmount / 10n); // 10%
                expect(await project.totalLocked()).to.equal(fundingAmount * 9n / 10n); // 90%
                expect(await project.projectValue()).to.equal(fundingAmount);
            });

            it("should reject immediate percentage above maximum", async function () {
                await expect(
                    project.connect(backer1).sendFundsWithImmediate(2500, { value: fundingAmount }) // 25% > 20%
                ).to.be.revertedWith("Immediate percentage exceeds maximum allowed");
            });

            it("should accept funding with 0% immediate (default)", async function () {
                await project.connect(backer1).sendFunds({ value: fundingAmount });

                const contrib = await project.contributions(backer1.address);
                expect(contrib.total).to.equal(fundingAmount);
                expect(contrib.immediateBps).to.equal(0);

                expect(await project.totalImmediate()).to.equal(0);
                expect(await project.totalLocked()).to.equal(fundingAmount);
            });

            it("should calculate weighted average for additional contributions", async function () {
                // First contribution: 100 ETH at 10% immediate = 10 immediate
                await project.connect(backer1).sendFundsWithImmediate(1000, { value: fundingAmount });

                // Second contribution: 100 ETH at 20% immediate = 20 immediate
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const contrib = await project.contributions(backer1.address);
                expect(contrib.total).to.equal(fundingAmount * 2n);
                // Weighted average: (10 + 20) / 200 = 15% = 1500 bps
                expect(contrib.immediateBps).to.equal(1500);

                expect(await project.totalImmediate()).to.equal(ethers.parseEther("30")); // 10 + 20
                expect(await project.totalLocked()).to.equal(ethers.parseEther("170")); // 90 + 80
            });
        });

        describe("signContract - Immediate Release", function () {
            beforeEach(async function () {
                project = await createNativeProject();
            });

            it("should release immediate funds to contractor at signing", async function () {
                // Backer funds with 20% immediate
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const immediateAmount = fundingAmount / 5n; // 20%
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;

                const contractorBalanceBefore = await ethers.provider.getBalance(contractor.address);

                const signTx = await project.connect(contractor).signContract({ value: arbitrationFee / 2n });
                const signReceipt = await signTx.wait();
                const gasUsed = signReceipt.gasUsed * signTx.gasPrice;

                const contractorBalanceAfter = await ethers.provider.getBalance(contractor.address);

                // Contractor should receive immediate funds minus their stake
                expect(contractorBalanceAfter).to.equal(
                    contractorBalanceBefore - (arbitrationFee / 2n) - gasUsed + immediateAmount
                );

                expect(await project.immediateReleased()).to.equal(immediateAmount);
                expect(await project.stage()).to.equal(2); // Ongoing
            });

            it("should not release any immediate funds if none specified", async function () {
                await project.connect(backer1).sendFunds({ value: fundingAmount }); // 0% immediate

                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorBalanceBefore = await ethers.provider.getBalance(contractor.address);

                const signTx = await project.connect(contractor).signContract({ value: arbitrationFee / 2n });
                const signReceipt = await signTx.wait();
                const gasUsed = signReceipt.gasUsed * signTx.gasPrice;

                const contractorBalanceAfter = await ethers.provider.getBalance(contractor.address);

                // Contractor should only lose their stake
                expect(contractorBalanceAfter).to.equal(
                    contractorBalanceBefore - (arbitrationFee / 2n) - gasUsed
                );

                expect(await project.immediateReleased()).to.equal(0);
            });

            it("should record immediate earnings for contractor (fee-free)", async function () {
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });
                const immediateAmount = fundingAmount / 5n;
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;

                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                // Check contractor earnings in Economy
                const contractorProfile = await economy.getUser(contractor.address);
                expect(contractorProfile.earnedTokens[0]).to.equal(NATIVE_CURRENCY);
                expect(contractorProfile.earnedAmounts[0]).to.equal(immediateAmount);
            });
        });

        describe("Voting - Locked Portion Only", function () {
            beforeEach(async function () {
                project = await createNativeProject();
            });

            it("should use locked portion for voting weight", async function () {
                // Backer1: 100 ETH at 20% immediate = 80 ETH locked
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });
                // Backer2: 100 ETH at 0% immediate = 100 ETH locked
                await project.connect(backer2).sendFunds({ value: fundingAmount });

                const arbitrationFee = ((fundingAmount * 2n) * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                // Vote to release
                await project.connect(backer1).voteToReleasePayment();

                // Check voting amounts based on locked portion
                const backer1Locked = fundingAmount * 8n / 10n; // 80 ETH
                expect(await project.totalVotesForRelease()).to.equal(backer1Locked);

                await project.connect(backer2).voteToReleasePayment();
                const backer2Locked = fundingAmount; // 100 ETH
                expect(await project.totalVotesForRelease()).to.equal(backer1Locked + backer2Locked);
            });

            it("should calculate quorum against totalLocked", async function () {
                // Fund with 20% immediate
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                const totalLocked = await project.totalLocked();
                expect(totalLocked).to.equal(fundingAmount * 8n / 10n); // 80 ETH

                // Single backer with 100% of locked should reach quorum (70%)
                await project.connect(backer1).voteToReleasePayment();

                // Should be closed since single backer has 100% of locked voting power
                expect(await project.stage()).to.equal(6); // Closed
                expect(await project.availableToContractor()).to.equal(totalLocked);
            });
        });

        describe("Contractor Withdrawal - Fees on Escrow Only", function () {
            it("should calculate fees only on escrow release, not immediate", async function () {
                project = await createNativeProject();

                // Fund with 20% immediate (20 ETH immediate, 80 ETH locked)
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                // Vote to release
                await project.connect(backer1).voteToReleasePayment();

                // availableToContractor should be totalLocked (80 ETH)
                const totalLocked = fundingAmount * 8n / 10n;
                expect(await project.availableToContractor()).to.equal(totalLocked);

                // Contractor withdraws - fees calculated on 80 ETH, not 100 ETH
                const platformFee = totalLocked / 100n; // 1%
                const authorFee = (totalLocked - platformFee) / 100n; // 1% of remainder
                const expectedPayout = totalLocked - platformFee - authorFee;

                const contractorBalanceBefore = await ethers.provider.getBalance(contractor.address);
                const withdrawTx = await project.connect(contractor).withdrawAsContractor();
                const withdrawReceipt = await withdrawTx.wait();
                const gasUsed = withdrawReceipt.gasUsed * withdrawTx.gasPrice;

                expect(await ethers.provider.getBalance(contractor.address)).to.equal(
                    contractorBalanceBefore + expectedPayout - gasUsed
                );

                // Check earnings - immediate (fee-free) + escrow payout (after fees)
                const contractorProfile = await economy.getUser(contractor.address);
                const immediateAmount = fundingAmount / 5n; // 20 ETH
                expect(contractorProfile.earnedAmounts[0]).to.equal(immediateAmount + expectedPayout);
            });
        });

        describe("Contributor Withdrawal", function () {
            it("should return full amount if withdrawn before signing", async function () {
                project = await createNativeProject();

                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const balanceBefore = await ethers.provider.getBalance(backer1.address);
                const withdrawTx = await project.connect(backer1).withdrawAsContributor();
                const withdrawReceipt = await withdrawTx.wait();
                const gasUsed = withdrawReceipt.gasUsed * withdrawTx.gasPrice;

                expect(await ethers.provider.getBalance(backer1.address)).to.equal(
                    balanceBefore + fundingAmount - gasUsed
                );

                // Verify totals are updated
                expect(await project.totalImmediate()).to.equal(0);
                expect(await project.totalLocked()).to.equal(0);
                expect(await project.projectValue()).to.equal(0);
            });

            it("should only return locked portion after project closes (immediate is gone)", async function () {
                project = await createNativeProject();

                // Fund with 20% immediate
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                // Vote to release (disputeResolution becomes 100 internally for release path)
                await project.connect(backer1).voteToReleasePayment();

                // Now in Closed stage. Backer withdraws.
                // With fundsReleased = true, disputeResolution = 0, backer gets 0% of locked back
                // This is correct - the funds were released to contractor

                const balanceBefore = await ethers.provider.getBalance(backer1.address);
                const withdrawTx = await project.connect(backer1).withdrawAsContributor();
                const withdrawReceipt = await withdrawTx.wait();
                const gasUsed = withdrawReceipt.gasUsed * withdrawTx.gasPrice;

                // Backer gets nothing back (all went to contractor)
                expect(await ethers.provider.getBalance(backer1.address)).to.equal(
                    balanceBefore - gasUsed
                );

                // Spendings should be recorded (immediate + locked)
                const backerProfile = await economy.getUser(backer1.address);
                expect(backerProfile.spentAmounts[0]).to.equal(fundingAmount);
            });
        });

        describe("Dispute Resolution with Immediate Release", function () {
            it("should correctly calculate contractor entitlement accounting for immediate", async function () {
                project = await createNativeProject();

                // Fund with 20% immediate (20 ETH immediate, 80 ETH locked)
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                // Vote to dispute
                await project.connect(backer1).voteToDispute();
                expect(await project.stage()).to.equal(3); // Dispute

                // Arbiter rules 50% to contractor
                await project.connect(arbiter).arbitrate(50, "ruling");

                // Finalize after appeal period
                const appealPeriod = await economy.appealPeriod();
                await time.increase(appealPeriod + 1n);
                await project.finalizeArbitration();

                // Calculate expected availableToContractor
                // Total value after arb fee: 20 (immediate) + (80 - 2.5) = 97.5 ETH
                // Contractor entitled to 50% = 48.75 ETH
                // Already received 20 ETH immediate
                // Available from escrow = 48.75 - 20 = 28.75 ETH
                const contributorShare = arbitrationFee - (arbitrationFee / 2n);
                const lockedAfterArbFee = (fundingAmount * 8n / 10n) - contributorShare;
                const totalValueAfterArbFee = (fundingAmount / 5n) + lockedAfterArbFee;
                const contractorEntitlement = (totalValueAfterArbFee * 50n) / 100n;
                const expectedAvailable = contractorEntitlement - (fundingAmount / 5n);

                expect(await project.availableToContractor()).to.equal(expectedAvailable);
            });

            it("should set availableToContractor to 0 if contractor already received more than entitled", async function () {
                project = await createNativeProject();

                // Fund with 20% immediate
                await project.connect(backer1).sendFundsWithImmediate(2000, { value: fundingAmount });

                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                await project.connect(contractor).signContract({ value: arbitrationFee / 2n });

                await project.connect(backer1).voteToDispute();

                // Arbiter rules only 10% to contractor (less than the 20% immediate they got)
                await project.connect(arbiter).arbitrate(10, "ruling");

                const appealPeriod = await economy.appealPeriod();
                await time.increase(appealPeriod + 1n);
                await project.finalizeArbitration();

                // Contractor entitled to ~10% but already got 20% immediate
                // availableToContractor should be 0
                expect(await project.availableToContractor()).to.equal(0);
            });
        });
    });

    describe("ERC20 Project - Immediate Release", function () {
        let project;
        const fundingAmount = ethers.parseEther("100");

        it("should work with ERC20 tokens same as native", async function () {
            project = await createERC20Project();

            // Fund with 20% immediate
            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, 2000);

            expect(await project.totalImmediate()).to.equal(fundingAmount / 5n);
            expect(await project.totalLocked()).to.equal(fundingAmount * 4n / 5n);

            // Sign contract
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            await testToken.connect(contractor).approve(await project.getAddress(), arbitrationFee / 2n);

            const contractorTokensBefore = await testToken.balanceOf(contractor.address);
            await project.connect(contractor).signContract();

            // Contractor receives immediate funds
            expect(await testToken.balanceOf(contractor.address)).to.equal(
                contractorTokensBefore - (arbitrationFee / 2n) + (fundingAmount / 5n)
            );
        });
    });
});
