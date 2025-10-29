const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Trustless Business Platform", function () {
    let economy, token;
    let admin, author, contractor, contributor1;

    const NATIVE_ARBITRATION_FEE = ethers.parseEther("1");
    const TOKEN_ARBITRATION_FEE = ethers.parseEther("100");

    beforeEach(async function () {
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
    });

    describe("NativeProject Workflow", function () {
        it("should correctly distribute funds with author and platform fees", async function () {
            // 1. Create Project
            const tx = await economy.connect(author).createProject(
                "Native Project",
                contractor.address,
                admin.address,
                "terms_hash", "repo", "description",
                { value: NATIVE_ARBITRATION_FEE / 2n }
            );
            const receipt = await tx.wait();

            // CORRECTED EVENT PARSING: Use receipt.logs and log.eventName
            const newProjectEvent = receipt.logs.find(log => log.eventName === 'NewProject');
            expect(newProjectEvent).to.not.be.undefined;
            const projectAddress = newProjectEvent.args.contractAddress;
            const nativeProject = await ethers.getContractAt("NativeProject", projectAddress);

            // 2. Fund Project
            const fundingAmount = ethers.parseEther("10");
            await nativeProject.connect(contributor1).sendFunds({ value: fundingAmount });
            
            // 3. Sign Contract
            await nativeProject.connect(contractor).signContract({ value: NATIVE_ARBITRATION_FEE / 2n });
            
            // 4. Vote to Release Payment
            await nativeProject.connect(contributor1).voteToReleasePayment();
            
            // 5. Contractor Withdraws Funds
            const authorBalanceBefore = await ethers.provider.getBalance(author.address);
            const contractorBalanceBefore = await ethers.provider.getBalance(contractor.address);
            const economyBalanceBefore = await ethers.provider.getBalance(await economy.getAddress());

            const withdrawTx = await nativeProject.connect(contractor).withdrawAsContractor();
            const withdrawReceipt = await withdrawTx.wait();
            const gasUsed = withdrawReceipt.gasUsed * withdrawTx.gasPrice;

            const platformFee = fundingAmount / 100n;
            const remainder = fundingAmount - platformFee;
            const authorFee = remainder / 100n;
            const contractorPayout = remainder - authorFee;

            expect(await ethers.provider.getBalance(author.address)).to.equal(authorBalanceBefore + authorFee);
            expect(await ethers.provider.getBalance(contractor.address)).to.equal(contractorBalanceBefore + contractorPayout - gasUsed);
            expect(await ethers.provider.getBalance(await economy.getAddress())).to.equal(economyBalanceBefore + platformFee);
        });
    });

    describe("ERC20Project Workflow", function () {
        it("should correctly distribute tokens with author and platform fees", async function () {
            const economyAddress = await economy.getAddress();
            const tokenAddress = await token.getAddress();

            // 1. Create Project
            await token.connect(author).approve(economyAddress, TOKEN_ARBITRATION_FEE / 2n);
            const tx = await economy.connect(author).createERC20Project(
                "ERC20 Project",
                contractor.address,
                admin.address,
                "terms_hash", "repo", "description",
                tokenAddress,
                TOKEN_ARBITRATION_FEE
            );
            const receipt = await tx.wait();
            
            // CORRECTED EVENT PARSING: Use receipt.logs and log.eventName
            const newProjectEvent = receipt.logs.find(log => log.eventName === 'NewProject');
            expect(newProjectEvent).to.not.be.undefined;
            const projectAddress = newProjectEvent.args.contractAddress;
            const erc20Project = await ethers.getContractAt("ERC20Project", projectAddress);
            
            // 2. Fund Project
            const fundingAmount = ethers.parseEther("1000");
            await token.connect(contributor1).approve(projectAddress, fundingAmount);
            await erc20Project.connect(contributor1).sendFunds(fundingAmount);
            
            // 3. Sign Contract
            await token.connect(contractor).approve(projectAddress, TOKEN_ARBITRATION_FEE / 2n);
            await erc20Project.connect(contractor).signContract();
            
            // 4. Vote to Release Payment
            await erc20Project.connect(contributor1).voteToReleasePayment();
            
            // 5. Contractor Withdraws Tokens
            const authorBalanceBefore = await token.balanceOf(author.address);
            const contractorBalanceBefore = await token.balanceOf(contractor.address);
            const economyBalanceBefore = await token.balanceOf(economyAddress);

            await erc20Project.connect(contractor).withdrawAsContractor();

            const platformFee = fundingAmount / 100n;
            const remainder = fundingAmount - platformFee;
            const authorFee = remainder / 100n;
            const contractorPayout = remainder - authorFee;

            expect(await token.balanceOf(author.address)).to.equal(authorBalanceBefore + authorFee);
            expect(await token.balanceOf(contractor.address)).to.equal(contractorBalanceBefore + contractorPayout);
            expect(await token.balanceOf(economyAddress)).to.equal(economyBalanceBefore + platformFee);
        });
    });
});
// happypath.js