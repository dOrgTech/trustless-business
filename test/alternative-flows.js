const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Alternative Project Flows", function () {
    let economy, token;
    let admin, author, contractor, contributor1, contributor2;

    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");

    // Re-usable setup function to create a project
    async function setupProject() {
        [admin, author, contractor, contributor1, contributor2] = await ethers.getSigners();

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
        await token.connect(admin).transfer(contributor2.address, ethers.parseEther("10000")); // Added for new test
// cool, Now I'll need a brief for the web app dev that will basically create the UX for interacting with this backend. It needs to be able to create a new project and do all of the things pertaining to the life cycle of a project. Would you be able to write up a brief for them? Not sure if it's relevant but they'll be using flutter. 


        // Create a project in the 'Pending' stage
        const economyAddress = await economy.getAddress();
        const tokenAddress = await token.getAddress();
        await token.connect(author).approve(economyAddress, TOKEN_ARBITRATION_FEE / 2n);
        const tx = await economy.connect(author).createERC20Project(
            "Test Project",
            contractor.address,
            admin.address,
            "terms_hash", "repo", "description",
            tokenAddress,
            TOKEN_ARBITRATION_FEE
        );
        const receipt = await tx.wait();
        const projectAddress = receipt.logs.find(log => log.eventName === 'NewProject').args.contractAddress;
        const erc20Project = await ethers.getContractAt("ERC20Project", projectAddress);

        return { erc20Project };
    }

    it("should allow a contributor to withdraw their funds before the contract is signed", async function () {
        const { erc20Project } = await setupProject();
        const projectAddress = await erc20Project.getAddress();

        const fundingAmount = ethers.parseEther("500");
        await token.connect(contributor1).approve(projectAddress, fundingAmount);
        await erc20Project.connect(contributor1).sendFunds(fundingAmount);

        expect(await token.balanceOf(projectAddress)).to.equal(
            (TOKEN_ARBITRATION_FEE / 2n) + fundingAmount
        );
        expect(await erc20Project.contributors(contributor1.address)).to.equal(fundingAmount);
        expect(await erc20Project.stage()).to.equal(1); 

        const contributorBalanceBefore = await token.balanceOf(contributor1.address);
        await erc20Project.connect(contributor1).withdrawAsContributor();
        const contributorBalanceAfter = await token.balanceOf(contributor1.address);

        expect(contributorBalanceAfter).to.equal(contributorBalanceBefore + fundingAmount);
        expect(await erc20Project.contributors(contributor1.address)).to.equal(0);
        expect(await token.balanceOf(projectAddress)).to.equal(TOKEN_ARBITRATION_FEE / 2n);
    });

    it("should allow author and contractor to reclaim arbitration fees on a successful project", async function () {
        const { erc20Project } = await setupProject();
        const projectAddress = await erc20Project.getAddress();
        const feeStake = TOKEN_ARBITRATION_FEE / 2n;

        await token.connect(contributor1).approve(projectAddress, ethers.parseEther("1"));
        await erc20Project.connect(contributor1).sendFunds(ethers.parseEther("1"));
        await token.connect(contractor).approve(projectAddress, feeStake);
        await erc20Project.connect(contractor).signContract();

        expect(await token.balanceOf(projectAddress)).to.equal(TOKEN_ARBITRATION_FEE + ethers.parseEther("1"));

        await erc20Project.connect(contributor1).voteToReleasePayment();
        expect(await erc20Project.stage()).to.equal(4);
        expect(await erc20Project.arbitrationFeePaidOut()).to.be.false;

        const authorBalanceBefore = await token.balanceOf(author.address);
        await erc20Project.connect(author).reclaimArbitrationFee();
        const authorBalanceAfter = await token.balanceOf(author.address);
        expect(authorBalanceAfter).to.equal(authorBalanceBefore + feeStake);

        const contractorBalanceBefore = await token.balanceOf(contractor.address);
        await erc20Project.connect(contractor).reclaimArbitrationFee();
        const contractorBalanceAfter = await token.balanceOf(contractor.address);
        expect(contractorBalanceAfter).to.equal(contractorBalanceBefore + feeStake);

        await expect(
            erc20Project.connect(author).reclaimArbitrationFee()
        ).to.be.revertedWith("You have already claimed this back.");
        await expect(
            erc20Project.connect(contractor).reclaimArbitrationFee()
        ).to.be.revertedWith("You have already claimed this back.");
    });

    it("should correctly handle a contributor switching their vote from dispute to release", async function () {
        const { erc20Project } = await setupProject();
        const projectAddress = await erc20Project.getAddress();
        
        // --- CORRECTED LOGIC: Use two contributors ---
        const fundingAmount1 = ethers.parseEther("50");
        const fundingAmount2 = ethers.parseEther("50");

        // 1. Both contributors fund the project, then it's signed.
        await token.connect(contributor1).approve(projectAddress, fundingAmount1);
        await erc20Project.connect(contributor1).sendFunds(fundingAmount1);
        await token.connect(contributor2).approve(projectAddress, fundingAmount2);
        await erc20Project.connect(contributor2).sendFunds(fundingAmount2);
        
        await token.connect(contractor).approve(projectAddress, TOKEN_ARBITRATION_FEE / 2n);
        await erc20Project.connect(contractor).signContract();
        expect(await erc20Project.stage()).to.equal(2); // Ongoing

        // 2. Contributor 1 votes to DISPUTE (now only 50% of the vote)
        await erc20Project.connect(contributor1).voteToDispute();

        // Verify vote totals. Stage should NOT change.
        expect(await erc20Project.totalVotesForDispute()).to.equal(fundingAmount1);
        expect(await erc20Project.totalVotesForRelease()).to.equal(0);
        expect(await erc20Project.stage()).to.equal(2); // Still Ongoing

        // 3. Contributor 1 changes mind and votes to RELEASE
        await erc20Project.connect(contributor1).voteToReleasePayment();

        // Verify totals have switched. Stage should still be Ongoing.
        expect(await erc20Project.totalVotesForDispute()).to.equal(0);
        expect(await erc20Project.totalVotesForRelease()).to.equal(fundingAmount1);
        expect(await erc20Project.contributorsDisputing(contributor1.address)).to.equal(0);
        expect(await erc20Project.contributorsReleasing(contributor1.address)).to.equal(fundingAmount1);
        expect(await erc20Project.stage()).to.equal(2); // Still Ongoing
    });

});
// alternative-flows.js