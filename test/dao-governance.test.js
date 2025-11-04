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
            // THE FIX: Expect the correct revert reason "Protected"
            await expect(economy.connect(author).setPlatformFee(200))
                .to.be.revertedWith("Protected");
            
            await expect(economy.connect(deployer).setNativeArbitrationFee(ethers.parseEther("1")))
                .to.be.revertedWith("Protected");
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