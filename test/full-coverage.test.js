const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * COMPREHENSIVE PROJECT LIFECYCLE TEST SUITE
 *
 * This test suite provides full coverage of all project scenarios to ensure:
 * 1. All funds are properly accounted for (no stuck funds)
 * 2. All stage transitions work correctly
 * 3. All resolution paths work correctly
 * 4. Edge cases are handled
 *
 * Key invariant tested:
 *   Total funds in (backer contributions + contractor stake) =
 *   Total funds out (arbiter + contractor + backers + platform fees + author fees)
 */

describe("Full Coverage: Project Lifecycle Tests", function () {
    let economy, nativeProjectImpl, erc20ProjectImpl, testToken, mockRepToken, mockGovernor;
    let deployer, timelock, registry, author, contractor, arbiter, backer1, backer2, backer3;

    const NATIVE_CURRENCY = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const ARBITRATION_FEE_BPS = 100; // 1%
    const PLATFORM_FEE_BPS = 100;    // 1%
    const AUTHOR_FEE_BPS = 100;      // 1%

    // Helper to create ERC20 project
    async function createERC20Project() {
        const tx = await economy.connect(author).createERC20Project(
            "Test Project", contractor.address, arbiter.address, "terms", "repo", "desc",
            await testToken.getAddress()
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        return ethers.getContractAt("ERC20Project", projectAddress);
    }

    // Helper to create Native project
    async function createNativeProject() {
        const tx = await economy.connect(author).createProject(
            "Test Project", contractor.address, arbiter.address, "terms", "repo", "desc"
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        return ethers.getContractAt("NativeProject", projectAddress);
    }

    // Helper to verify zero balance after all withdrawals
    async function verifyZeroBalance(project, isNative = false) {
        const projectAddr = await project.getAddress();
        const balance = isNative
            ? await ethers.provider.getBalance(projectAddr)
            : await testToken.balanceOf(projectAddr);
        expect(balance).to.equal(0, "Project should have zero balance after all withdrawals");
    }

    // Helper to record all balances before operations
    async function recordBalances(addresses, isNative = false) {
        const balances = {};
        for (const [name, addr] of Object.entries(addresses)) {
            balances[name] = isNative
                ? await ethers.provider.getBalance(addr)
                : await testToken.balanceOf(addr);
        }
        return balances;
    }

    beforeEach(async function () {
        [deployer, timelock, registry, author, contractor, arbiter, backer1, backer2, backer3] = await ethers.getSigners();

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

        // Fund test accounts with plenty of tokens
        const fundAmount = ethers.parseEther("100000");
        await testToken.connect(deployer).transfer(backer1.address, fundAmount);
        await testToken.connect(deployer).transfer(backer2.address, fundAmount);
        await testToken.connect(deployer).transfer(backer3.address, fundAmount);
        await testToken.connect(deployer).transfer(contractor.address, fundAmount);
        await testToken.connect(deployer).transfer(author.address, fundAmount);
    });

    // ============================================================================
    // SECTION 1: HAPPY PATH - RELEASE VOTE
    // ============================================================================
    describe("1. Happy Path: Release Vote", function() {

        describe("1.1 ERC20 Projects", function() {
            it("should handle release vote with NO immediate release", async function() {
                const project = await createERC20Project();
                const fundingAmount = ethers.parseEther("1000");
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                // Fund
                await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
                await project.connect(backer1).sendFunds(fundingAmount);

                // Sign
                await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                await project.connect(contractor).signContract();

                // Release vote
                await project.connect(backer1).voteToReleasePayment();
                expect(await project.stage()).to.equal(6); // Closed
                expect(await project.fundsReleased()).to.be.true;

                // Withdrawals
                await project.connect(contractor).withdrawAsContractor();
                await project.connect(contractor).reclaimArbitrationStake();

                // Verify zero balance
                await verifyZeroBalance(project);
            });

            it("should handle release vote with 10% immediate release", async function() {
                const project = await createERC20Project();
                const fundingAmount = ethers.parseEther("1000");
                const immediateBps = 1000n; // 10%
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                // Fund with immediate
                await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
                await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);

                // Sign (immediate is released here)
                await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                await project.connect(contractor).signContract();

                // Release vote
                await project.connect(backer1).voteToReleasePayment();

                // Withdrawals
                await project.connect(contractor).withdrawAsContractor();
                await project.connect(contractor).reclaimArbitrationStake();

                // Verify zero balance
                await verifyZeroBalance(project);
            });

            it("should handle release vote with 20% immediate release (max allowed)", async function() {
                const project = await createERC20Project();
                const fundingAmount = ethers.parseEther("1000");
                const immediateBps = 2000n; // 20% (max allowed)
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
                await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);

                await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                await project.connect(contractor).signContract();

                await project.connect(backer1).voteToReleasePayment();

                await project.connect(contractor).withdrawAsContractor();
                await project.connect(contractor).reclaimArbitrationStake();

                await verifyZeroBalance(project);
            });

            it("should handle release vote with multiple backers", async function() {
                const project = await createERC20Project();
                const funding1 = ethers.parseEther("600");
                const funding2 = ethers.parseEther("400");
                const totalFunding = funding1 + funding2;
                const arbitrationFee = (totalFunding * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                // Both fund with different immediate percentages
                await testToken.connect(backer1).approve(await project.getAddress(), funding1);
                await project.connect(backer1).sendFundsWithImmediate(funding1, 1000n); // 10%

                await testToken.connect(backer2).approve(await project.getAddress(), funding2);
                await project.connect(backer2).sendFundsWithImmediate(funding2, 2000n); // 20%

                await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                await project.connect(contractor).signContract();

                // Both vote to release
                await project.connect(backer1).voteToReleasePayment();
                await project.connect(backer2).voteToReleasePayment();

                await project.connect(contractor).withdrawAsContractor();
                await project.connect(contractor).reclaimArbitrationStake();

                await verifyZeroBalance(project);
            });
        });

        describe("1.2 Native Projects", function() {
            it("should handle release vote with NO immediate release", async function() {
                const project = await createNativeProject();
                const fundingAmount = ethers.parseEther("10");
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                await project.connect(backer1).sendFunds({ value: fundingAmount });
                await project.connect(contractor).signContract({ value: contractorStake });
                await project.connect(backer1).voteToReleasePayment();

                await project.connect(contractor).withdrawAsContractor();
                await project.connect(contractor).reclaimArbitrationStake();

                await verifyZeroBalance(project, true);
            });

            it("should handle release vote with 10% immediate release", async function() {
                const project = await createNativeProject();
                const fundingAmount = ethers.parseEther("10");
                const immediateBps = 1000n;
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                await project.connect(backer1).sendFundsWithImmediate(immediateBps, { value: fundingAmount });
                await project.connect(contractor).signContract({ value: contractorStake });
                await project.connect(backer1).voteToReleasePayment();

                await project.connect(contractor).withdrawAsContractor();
                await project.connect(contractor).reclaimArbitrationStake();

                await verifyZeroBalance(project, true);
            });
        });
    });

    // ============================================================================
    // SECTION 2: DISPUTE PATH - ARBITRATION FINALIZED
    // ============================================================================
    describe("2. Dispute Path: Arbitration Finalized (No Appeal)", function() {

        describe("2.1 ERC20 Projects", function() {
            // Test matrix: immediate release % × dispute resolution %
            // Note: maxImmediateBps is typically 20% (2000), so we keep immediate ≤ 20%
            const testCases = [
                { immediatePercent: 0, resolutionPercent: 0, desc: "0% immediate, 0% resolution" },
                { immediatePercent: 0, resolutionPercent: 50, desc: "0% immediate, 50% resolution" },
                { immediatePercent: 0, resolutionPercent: 90, desc: "0% immediate, 90% resolution" },
                { immediatePercent: 0, resolutionPercent: 100, desc: "0% immediate, 100% resolution" },
                { immediatePercent: 10, resolutionPercent: 0, desc: "10% immediate, 0% resolution" },
                { immediatePercent: 10, resolutionPercent: 50, desc: "10% immediate, 50% resolution" },
                { immediatePercent: 10, resolutionPercent: 90, desc: "10% immediate, 90% resolution" },
                { immediatePercent: 10, resolutionPercent: 100, desc: "10% immediate, 100% resolution" },
                { immediatePercent: 20, resolutionPercent: 30, desc: "20% immediate, 30% resolution" },
                { immediatePercent: 20, resolutionPercent: 70, desc: "20% immediate, 70% resolution" },
            ];

            testCases.forEach(({ immediatePercent, resolutionPercent, desc }) => {
                it(`should have zero balance: ${desc}`, async function() {
                    const project = await createERC20Project();
                    const fundingAmount = ethers.parseEther("1000");
                    const immediateBps = BigInt(immediatePercent * 100);
                    const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                    const contractorStake = arbitrationFee / 2n;

                    // Fund
                    await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
                    if (immediatePercent > 0) {
                        await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);
                    } else {
                        await project.connect(backer1).sendFunds(fundingAmount);
                    }

                    // Sign
                    await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                    await project.connect(contractor).signContract();

                    // Dispute
                    await project.connect(backer1).voteToDispute();
                    expect(await project.stage()).to.equal(3); // Dispute

                    // Arbitrate
                    await project.connect(arbiter).arbitrate(resolutionPercent, "ruling");

                    // Finalize after appeal period
                    const appealPeriod = await economy.appealPeriod();
                    await time.increase(appealPeriod + 1n);
                    await project.finalizeArbitration();

                    // Withdrawals - contractor first if they have anything
                    const availableToContractor = await project.availableToContractor();
                    if (availableToContractor > 0n) {
                        await project.connect(contractor).withdrawAsContractor();
                    }

                    // Backer withdraws if they have anything
                    const contrib = await project.contributions(backer1.address);
                    if (contrib.total > 0n) {
                        await project.connect(backer1).withdrawAsContributor();
                    }

                    // Verify zero balance
                    await verifyZeroBalance(project);
                });
            });

            it("should handle multiple backers with different immediate percentages", async function() {
                const project = await createERC20Project();
                const funding1 = ethers.parseEther("500");
                const funding2 = ethers.parseEther("300");
                const funding3 = ethers.parseEther("200");
                const totalFunding = funding1 + funding2 + funding3;
                const arbitrationFee = (totalFunding * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                // Three backers with different immediate percentages
                await testToken.connect(backer1).approve(await project.getAddress(), funding1);
                await project.connect(backer1).sendFundsWithImmediate(funding1, 0n); // 0%

                await testToken.connect(backer2).approve(await project.getAddress(), funding2);
                await project.connect(backer2).sendFundsWithImmediate(funding2, 1500n); // 15%

                await testToken.connect(backer3).approve(await project.getAddress(), funding3);
                await project.connect(backer3).sendFundsWithImmediate(funding3, 2000n); // 20% (max allowed)

                await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                await project.connect(contractor).signContract();

                // All dispute
                await project.connect(backer1).voteToDispute();
                await project.connect(backer2).voteToDispute();
                await project.connect(backer3).voteToDispute();

                // Arbitrate at 60%
                await project.connect(arbiter).arbitrate(60, "ruling");

                // Finalize
                const appealPeriod = await economy.appealPeriod();
                await time.increase(appealPeriod + 1n);
                await project.finalizeArbitration();

                // All withdraw
                await project.connect(contractor).withdrawAsContractor();
                await project.connect(backer1).withdrawAsContributor();
                await project.connect(backer2).withdrawAsContributor();
                await project.connect(backer3).withdrawAsContributor();

                await verifyZeroBalance(project);
            });
        });

        describe("2.2 Native Projects", function() {
            const testCases = [
                { immediatePercent: 0, resolutionPercent: 50, desc: "0% immediate, 50% resolution" },
                { immediatePercent: 0, resolutionPercent: 90, desc: "0% immediate, 90% resolution" },
                { immediatePercent: 10, resolutionPercent: 60, desc: "10% immediate, 60% resolution" },
                { immediatePercent: 20, resolutionPercent: 75, desc: "20% immediate, 75% resolution" },
            ];

            testCases.forEach(({ immediatePercent, resolutionPercent, desc }) => {
                it(`should have zero balance: ${desc}`, async function() {
                    const project = await createNativeProject();
                    const fundingAmount = ethers.parseEther("10");
                    const immediateBps = BigInt(immediatePercent * 100);
                    const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                    const contractorStake = arbitrationFee / 2n;

                    if (immediatePercent > 0) {
                        await project.connect(backer1).sendFundsWithImmediate(immediateBps, { value: fundingAmount });
                    } else {
                        await project.connect(backer1).sendFunds({ value: fundingAmount });
                    }

                    await project.connect(contractor).signContract({ value: contractorStake });
                    await project.connect(backer1).voteToDispute();
                    await project.connect(arbiter).arbitrate(resolutionPercent, "ruling");

                    const appealPeriod = await economy.appealPeriod();
                    await time.increase(appealPeriod + 1n);
                    await project.finalizeArbitration();

                    const availableToContractor = await project.availableToContractor();
                    if (availableToContractor > 0n) {
                        await project.connect(contractor).withdrawAsContractor();
                    }
                    await project.connect(backer1).withdrawAsContributor();

                    await verifyZeroBalance(project, true);
                });
            });
        });
    });

    // ============================================================================
    // SECTION 3: APPEAL PATH - DAO OVERRULE
    // ============================================================================
    describe("3. Appeal Path: DAO Overrule", function() {

        describe("3.1 ERC20 Projects", function() {
            const testCases = [
                { immediatePercent: 0, arbiterPercent: 30, daoPercent: 90, desc: "0% immediate, arbiter 30%, DAO 90%" },
                { immediatePercent: 10, arbiterPercent: 30, daoPercent: 90, desc: "10% immediate, arbiter 30%, DAO 90%" },
                { immediatePercent: 10, arbiterPercent: 70, daoPercent: 50, desc: "10% immediate, arbiter 70%, DAO 50%" },
                { immediatePercent: 0, arbiterPercent: 50, daoPercent: 100, desc: "0% immediate, arbiter 50%, DAO 100%" },
                { immediatePercent: 0, arbiterPercent: 50, daoPercent: 0, desc: "0% immediate, arbiter 50%, DAO 0%" },
            ];

            testCases.forEach(({ immediatePercent, arbiterPercent, daoPercent, desc }) => {
                it(`should have zero balance: ${desc}`, async function() {
                    const project = await createERC20Project();
                    const fundingAmount = ethers.parseEther("1000");
                    const immediateBps = BigInt(immediatePercent * 100);
                    const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                    const contractorStake = arbitrationFee / 2n;

                    // Fund
                    await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
                    if (immediatePercent > 0) {
                        await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);
                    } else {
                        await project.connect(backer1).sendFunds(fundingAmount);
                    }

                    // Sign
                    await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
                    await project.connect(contractor).signContract();

                    // Dispute
                    await project.connect(backer1).voteToDispute();

                    // Arbiter rules
                    await project.connect(arbiter).arbitrate(arbiterPercent, "arbiter_ruling");
                    expect(await project.stage()).to.equal(4); // Appealable

                    // Setup for appeal - backer needs reputation and governor needs to return valid state
                    const projectThreshold = await economy.projectThreshold();
                    await mockRepToken.mint(backer1.address, projectThreshold);
                    await mockGovernor.setProposalState(1); // Active state

                    // Backer appeals
                    await project.connect(backer1).appeal(123, [await project.getAddress()]);
                    expect(await project.stage()).to.equal(5); // Appeal

                    // DAO overrules
                    await project.connect(timelock).daoOverrule(daoPercent, "dao_ruling");
                    expect(await project.stage()).to.equal(6); // Closed

                    // Withdrawals
                    const availableToContractor = await project.availableToContractor();
                    if (availableToContractor > 0n) {
                        await project.connect(contractor).withdrawAsContractor();
                    }

                    const contrib = await project.contributions(backer1.address);
                    if (contrib.total > 0n) {
                        await project.connect(backer1).withdrawAsContributor();
                    }

                    await verifyZeroBalance(project);
                });
            });
        });

        describe("3.2 Native Projects", function() {
            it("should have zero balance: 10% immediate, arbiter 30%, DAO 90%", async function() {
                const project = await createNativeProject();
                const fundingAmount = ethers.parseEther("10");
                const immediateBps = 1000n; // 10%
                const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
                const contractorStake = arbitrationFee / 2n;

                await project.connect(backer1).sendFundsWithImmediate(immediateBps, { value: fundingAmount });
                await project.connect(contractor).signContract({ value: contractorStake });

                await project.connect(backer1).voteToDispute();
                await project.connect(arbiter).arbitrate(30, "arbiter_ruling");

                // Setup for appeal
                const projectThreshold = await economy.projectThreshold();
                await mockRepToken.mint(backer1.address, projectThreshold);
                await mockGovernor.setProposalState(1);

                // Appeal then DAO overrule
                await project.connect(backer1).appeal(123, [await project.getAddress()]);
                await project.connect(timelock).daoOverrule(90, "dao_ruling");

                await project.connect(contractor).withdrawAsContractor();
                await project.connect(backer1).withdrawAsContributor();

                await verifyZeroBalance(project, true);
            });
        });
    });

    // ============================================================================
    // SECTION 4: ARBITER INACTIVITY - DAO ESCALATION
    // ============================================================================
    describe("4. Arbiter Inactivity: DAO Can Finalize Without Ruling", function() {

        it("should allow DAO to finalize when arbiter doesn't rule (ERC20)", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, 1000n);

            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            await project.connect(backer1).voteToDispute();

            // Arbiter doesn't rule - wait for appeal period
            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);

            // After appeal period, anyone can escalate via appeal
            const projectThreshold = await economy.projectThreshold();
            await mockRepToken.mint(backer1.address, projectThreshold);
            await mockGovernor.setProposalState(1);

            // Appeal (even without arbiter ruling, this is allowed after appeal period)
            await project.connect(backer1).appeal(123, [await project.getAddress()]);

            // DAO overrules - since arbiter didn't rule, fee goes to treasury not arbiter
            await project.connect(timelock).daoOverrule(50, "dao_ruling_no_arbiter");

            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            await verifyZeroBalance(project);
        });
    });

    // ============================================================================
    // SECTION 5: PRE-SIGNING WITHDRAWALS
    // ============================================================================
    describe("5. Pre-Signing: Backer Withdrawals", function() {

        it("should allow full withdrawal before signing (ERC20)", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, 2000n); // 20% immediate

            const balanceBefore = await testToken.balanceOf(backer1.address);
            await project.connect(backer1).withdrawAsContributor();
            const balanceAfter = await testToken.balanceOf(backer1.address);

            // Should get full amount back
            expect(balanceAfter - balanceBefore).to.equal(fundingAmount);
            await verifyZeroBalance(project);
        });

        it("should allow partial withdrawal with multiple backers (ERC20)", async function() {
            const project = await createERC20Project();
            const funding1 = ethers.parseEther("600");
            const funding2 = ethers.parseEther("400");

            await testToken.connect(backer1).approve(await project.getAddress(), funding1);
            await project.connect(backer1).sendFunds(funding1);

            await testToken.connect(backer2).approve(await project.getAddress(), funding2);
            await project.connect(backer2).sendFunds(funding2);

            // Backer1 withdraws, backer2 stays
            await project.connect(backer1).withdrawAsContributor();

            expect(await project.projectValue()).to.equal(funding2);

            // Backer2 also withdraws
            await project.connect(backer2).withdrawAsContributor();
            await verifyZeroBalance(project);
        });
    });

    // ============================================================================
    // SECTION 6: CONTRACTOR REIMBURSES
    // ============================================================================
    describe("6. Contractor Reimburses (Cancels Project)", function() {

        it("should allow full refund when contractor reimburses (ERC20)", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const immediateBps = 1000n; // 10%
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);

            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            // Contractor reimburses (gives up immediate funds)
            await project.connect(contractor).reimburse();
            expect(await project.stage()).to.equal(6); // Closed
            expect(await project.disputeResolution()).to.equal(0); // 0% to contractor

            // Backer withdraws locked portion
            await project.connect(backer1).withdrawAsContributor();

            // Contractor can reclaim stake
            await project.connect(contractor).reclaimArbitrationStake();

            await verifyZeroBalance(project);
        });
    });

    // ============================================================================
    // SECTION 7: DAO VETO
    // ============================================================================
    describe("7. DAO Veto (Cancels Active Project)", function() {

        it("should allow full refund to backers when DAO vetoes (ERC20)", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const immediateBps = 1000n;
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);

            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            // DAO vetoes
            await project.connect(timelock).daoVeto();
            expect(await project.stage()).to.equal(6); // Closed
            expect(await project.disputeResolution()).to.equal(0); // 0% to contractor

            // Backer withdraws
            await project.connect(backer1).withdrawAsContributor();

            // Contractor can try to reclaim stake (should work since no arbitration)
            await project.connect(contractor).reclaimArbitrationStake();

            await verifyZeroBalance(project);
        });
    });

    // ============================================================================
    // SECTION 8: EDGE CASES & ROUNDING
    // ============================================================================
    describe("8. Edge Cases", function() {

        it("should handle very small amounts without rounding issues", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("0.001"); // 1 finney
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFunds(fundingAmount);

            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            await project.connect(backer1).voteToDispute();
            await project.connect(arbiter).arbitrate(77, "ruling"); // Odd percentage

            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.finalizeArbitration();

            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            // May have dust from rounding - check it's minimal (< 10 wei)
            const projectAddr = await project.getAddress();
            const remaining = await testToken.balanceOf(projectAddr);
            expect(remaining).to.be.lt(10, "Should have minimal rounding dust");
        });

        it("should handle maximum immediate release (max allowed)", async function() {
            const maxImmediateBps = await economy.maxImmediateBps();
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, maxImmediateBps);

            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            await project.connect(backer1).voteToReleasePayment();

            await project.connect(contractor).withdrawAsContractor();
            await project.connect(contractor).reclaimArbitrationStake();

            await verifyZeroBalance(project);
        });

        it("should reject immediate release above maximum", async function() {
            const maxImmediateBps = await economy.maxImmediateBps();
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");

            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);

            await expect(
                project.connect(backer1).sendFundsWithImmediate(fundingAmount, maxImmediateBps + 1n)
            ).to.be.revertedWith("Immediate percentage exceeds maximum allowed");
        });
    });

    // ============================================================================
    // SECTION 9: FUND ACCOUNTING INVARIANTS
    // ============================================================================
    describe("9. Fund Accounting Invariants", function() {

        it("should distribute all funds correctly: arbiter + contractor + backer + fees = total", async function() {
            const project = await createERC20Project();
            const fundingAmount = ethers.parseEther("1000");
            const immediateBps = 1000n; // 10%
            const resolutionPercent = 70;
            const arbitrationFee = (fundingAmount * BigInt(ARBITRATION_FEE_BPS)) / 10000n;
            const contractorStake = arbitrationFee / 2n;

            // Record initial balances
            const initialBalances = await recordBalances({
                arbiter: arbiter.address,
                contractor: contractor.address,
                backer1: backer1.address,
                registry: registry.address,
                author: author.address,
            });

            // Execute full flow
            await testToken.connect(backer1).approve(await project.getAddress(), fundingAmount);
            await project.connect(backer1).sendFundsWithImmediate(fundingAmount, immediateBps);

            await testToken.connect(contractor).approve(await project.getAddress(), contractorStake);
            await project.connect(contractor).signContract();

            await project.connect(backer1).voteToDispute();
            await project.connect(arbiter).arbitrate(resolutionPercent, "ruling");

            const appealPeriod = await economy.appealPeriod();
            await time.increase(appealPeriod + 1n);
            await project.finalizeArbitration();

            await project.connect(contractor).withdrawAsContractor();
            await project.connect(backer1).withdrawAsContributor();

            // Record final balances
            const finalBalances = await recordBalances({
                arbiter: arbiter.address,
                contractor: contractor.address,
                backer1: backer1.address,
                registry: registry.address,
                author: author.address,
            });

            // Calculate net flows
            const arbiterGain = finalBalances.arbiter - initialBalances.arbiter;
            const contractorNet = finalBalances.contractor - initialBalances.contractor;
            const backer1Net = finalBalances.backer1 - initialBalances.backer1;
            const registryGain = finalBalances.registry - initialBalances.registry;
            const authorGain = finalBalances.author - initialBalances.author;

            // Verify arbiter got the arbitration fee
            expect(arbiterGain).to.equal(arbitrationFee);

            // Total in = backer contribution + contractor stake
            const totalIn = fundingAmount + contractorStake;

            // Total distributed = all gains minus backer's net (which is negative = their contribution)
            // backer1Net is negative (they put in fundingAmount, got some back)
            // contractorNet includes: -stake + immediate + withdrawal - stake back
            const totalDistributed = arbiterGain + registryGain + authorGain +
                                     (contractorNet + contractorStake) + // contractor's gross gain
                                     (fundingAmount + backer1Net);        // backer's loss

            // Should equal total funds that entered the system
            expect(totalDistributed).to.equal(totalIn);

            // Project should be empty
            await verifyZeroBalance(project);
        });
    });
});
