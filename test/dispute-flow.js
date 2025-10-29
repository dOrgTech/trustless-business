const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Dispute and Arbitration Workflow", function () {
    let economy, token;
    let admin, author, contractor, contributor1;

    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");

    // Re-usable setup function for a funded, ongoing ERC20 project
    async function setupOngoingProject() {
        [admin, author, contractor, contributor1] = await ethers.getSigners();

        const NativeProjectImpl = await ethers.getContractFactory("NativeProject");
        const nativeProjectImpl = await NativeProjectImpl.deploy();

        const ERC20ProjectImpl = await ethers.getContractFactory("ERC20Project");
        const erc20ProjectImpl = await ERC20ProjectImpl.deploy();

        const Economy = await ethers.getContractFactory("Economy");
        economy = await Economy.connect(admin).deploy();

        await economy.connect(admin).setImplementations(
            await nativeProjectImpl.getAddress(),
            await erc20ProjectImpl.getAddress()
        );

        const TestToken = await ethers.getContractFactory("TestToken");
        token = await TestToken.connect(admin).deploy();

        await token.connect(admin).transfer(author.address, ethers.parseEther("10000"));
        await token.connect(admin).transfer(contractor.address, ethers.parseEther("10000"));
        await token.connect(admin).transfer(contributor1.address, ethers.parseEther("10000"));

        // Create Project
        const economyAddress = await economy.getAddress();
        const tokenAddress = await token.getAddress();
        await token.connect(author).approve(economyAddress, TOKEN_ARBITRATION_FEE / 2n);
        const tx = await economy.connect(author).createERC20Project(
            "Disputed ERC20 Project",
            contractor.address,
            admin.address, // Arbiter is admin for this test
            "terms_hash", "repo", "description",
            tokenAddress,
            TOKEN_ARBITRATION_FEE
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        const erc20Project = await ethers.getContractAt("ERC20Project", projectAddress);

        // Fund Project
        const fundingAmount = ethers.parseEther("1000");
        await token.connect(contributor1).approve(projectAddress, fundingAmount);
        await erc20Project.connect(contributor1).sendFunds(fundingAmount);

        // Sign Contract
        await token.connect(contractor).approve(projectAddress, TOKEN_ARBITRATION_FEE / 2n);
        await erc20Project.connect(contractor).signContract();

        return { erc20Project, fundingAmount };
    }

    it("should correctly process a 60% payout after arbitration", async function () {
        const { erc20Project, fundingAmount } = await setupOngoingProject();
        const projectAddress = await erc20Project.getAddress();

        // 1. Vote to Dispute
        await erc20Project.connect(contributor1).voteToDispute();
        expect(await erc20Project.stage()).to.equal(3); // 3 is "Dispute"

        // 2. Arbiter makes a ruling (60% success)
        const arbiterBalanceBeforeArbitration = await token.balanceOf(admin.address);
        const payoutPercent = 60n;
        await erc20Project.connect(admin).arbitrate(payoutPercent, "ruling_hash_for_60_percent");
        
        // --- VERIFY ARBITER PAYOUT ---
        // The arbiter should receive their fee immediately upon ruling.
        const arbiterPayout = TOKEN_ARBITRATION_FEE;
        const arbiterBalanceAfterArbitration = await token.balanceOf(admin.address);
        expect(arbiterBalanceAfterArbitration).to.equal(arbiterBalanceBeforeArbitration + arbiterPayout);

        // Check project state after arbitration
        expect(await erc20Project.stage()).to.equal(4); // 4 is "Closed"
        const expectedContractorPayout = (fundingAmount * payoutPercent) / 100n;
        expect(await erc20Project.availableToContractor()).to.equal(expectedContractorPayout);

        // 3. Contractor withdraws their arbitrated share
        const authorBalanceBefore = await token.balanceOf(author.address);
        const contractorBalanceBefore = await token.balanceOf(contractor.address);
        const economyBalanceBefore = await token.balanceOf(await economy.getAddress());

        await erc20Project.connect(contractor).withdrawAsContractor();
        
        // 4. Verify Author, Contractor, and Platform balances
        const platformFee = expectedContractorPayout / 100n;
        const remainder = expectedContractorPayout - platformFee;
        const authorFee = remainder / 100n;
        const contractorFinalPayout = remainder - authorFee;
        
        expect(await token.balanceOf(author.address)).to.equal(authorBalanceBefore + authorFee);
        expect(await token.balanceOf(contractor.address)).to.equal(contractorBalanceBefore + contractorFinalPayout);
        expect(await token.balanceOf(await economy.getAddress())).to.equal(economyBalanceBefore + platformFee);

        // 5. Verify contributor can withdraw their remaining funds
        const contributorBalanceBefore = await token.balanceOf(contributor1.address);
        const totalAwarded = expectedContractorPayout;
        const contributorShareToReturn = fundingAmount - totalAwarded;

        await erc20Project.connect(contributor1).withdrawAsContributor();
        expect(await token.balanceOf(contributor1.address)).to.equal(contributorBalanceBefore + contributorShareToReturn);

        // Final check: Project contract should be (nearly) empty of project funds
        const remainingDust = await token.balanceOf(projectAddress);
        expect(remainingDust).to.be.below(100); // Allow for rounding dust
    });
});
// dispute-flow.js